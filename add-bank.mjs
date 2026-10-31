#!/usr/bin/env node
/**
 * Connect one new bank to TrueLayer and print the snippets to paste into config.json / state.json.
 *
 * Usage: node --env-file=.env add-bank.mjs
 */

import fs from 'node:fs'
import readline from 'node:readline/promises'

const OUTPUT_DIR = 'tmp'
const CONFIG_FILE = `${OUTPUT_DIR}/config.json`
const STATE_FILE = `${OUTPUT_DIR}/state.json`
const REDIRECT_URI = 'https://console.truelayer.com/redirect-page'
const SCOPE = 'cards accounts balance transactions offline_access'

// Accepts the full redirect URL or just the code
export function parseCode(pasted) {
  const value = pasted.trim()
  try {
    return new URL(value).searchParams.get('code') ?? ''
  } catch {
    return value
  }
}

// Missing file → fallback; unreadable JSON throws so we never overwrite it
export function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`Could not parse ./${file} — fix or move it, then re-run. (${err.message})`)
  }
}

export function addConnection(config, state, connection, refreshToken) {
  return {
    config: { ...config, connections: [...(config.connections ?? []), connection] },
    state: { ...state, connections: { ...state.connections, [connection.name]: { refreshToken, accounts: {} } } },
  }
}

async function request(url, options) {
  const res = await fetch(url, options)
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

// Returns [] when the bank doesn't offer this type (e.g. no cards)
async function list(type, accessToken) {
  const res = await request(`https://api.truelayer.com/data/v1/${type}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.body.error === 'endpoint_not_supported') return []
  if (!res.ok) throw new Error(`GET /v1/${type} failed: ${res.status} — ${res.body.error ?? 'unknown_error'}`)
  return res.body.results ?? []
}

async function main() {
  const { TRUELAYER_CLIENT_ID: clientId, TRUELAYER_CLIENT_SECRET: clientSecret } = process.env
  if (!clientId || !clientSecret) {
    console.error('TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET must be set. Run: node --env-file=.env add-bank.mjs')
    process.exit(1)
  }

  // Read up front so a broken file fails before the bank login, not after
  const config = readJSON(CONFIG_FILE, { version: 2, connections: [] })
  const state = readJSON(STATE_FILE, { connections: {} })
  const existingNames = new Set([...(config.connections ?? []).map((c) => c.name), ...Object.keys(state.connections ?? {})])

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    providers: 'uk-ob-all uk-oauth-all',
    response_mode: 'query',
  })
  console.log(`\n1. Open this URL and log in to your bank:\n\n  https://auth.truelayer.com/?${params}\n`)

  const code = parseCode(await rl.question('2. Paste the redirect URL (or just the code): '))
  if (!code) {
    console.error('No code found in what you pasted.')
    process.exit(1)
  }

  const token = await request('https://auth.truelayer.com/connect/token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  })
  if (!token.ok) {
    console.error(`Token exchange failed: ${token.status} — ${token.body.error ?? 'unknown_error'}`)
    process.exit(1)
  }
  const { access_token: accessToken, refresh_token: refreshToken } = token.body

  const accounts = await list('accounts', accessToken)
  const cards = await list('cards', accessToken)
  console.log(`\nFound ${accounts.length} account(s) and ${cards.length} card(s).`)

  let name = ''
  while (!name) {
    name = (await rl.question('\n3. Name for this connection: ')).trim()
    if (existingNames.has(name)) {
      console.log(`  "${name}" already exists in ./${CONFIG_FILE} or ./${STATE_FILE} — pick another.`)
      name = ''
    }
  }
  rl.close()

  const connection = {
    name,
    accounts: [
      ...accounts.map((a) => ({ trueLayerId: a.account_id, actualId: 'TODO', friendlyName: a.display_name })),
      // flip must be explicit: in a mixed connection the sync only lists accounts, so it can't auto-detect credit cards
      ...cards.map((c) => ({
        trueLayerId: c.account_id,
        actualId: 'TODO',
        friendlyName: c.display_name,
        isCard: true,
        flip: true,
      })),
    ],
  }
  const updated = addConnection(config, state, connection, refreshToken)
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated.config, null, 2) + '\n')
  fs.writeFileSync(STATE_FILE, JSON.stringify(updated.state, null, 2) + '\n')
  console.log(`\nAdded "${name}" to ./${CONFIG_FILE} and ./${STATE_FILE}.`)
  console.log(`
Next steps:
  • Run this again for each other bank — both files grow.
  • In ./${CONFIG_FILE}: delete any accounts you don't want to sync, and replace each "TODO"
    with the Actual Budget account ID (the ID in the URL when viewing that account in Actual).
  • Copy both files into your data volume (e.g. ./actual-truelayer-sync/data/), merging if files already exist there.
  • Restart the container: docker compose restart actual-truelayer-sync
`)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
