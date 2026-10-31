import actual from '@actual-app/api'

interface InitOptions {
  serverURL: string
  password: string
  syncId: string
  encryptionPassword?: string
  verbose: boolean
}

export async function initActual(options: InitOptions): Promise<void> {
  await actual.init({
    serverURL: options.serverURL,
    password: options.password,
    verbose: options.verbose,
    dataDir: './data',
  })
  try {
    if (options.encryptionPassword) {
      await actual.downloadBudget(options.syncId, { password: options.encryptionPassword })
    } else {
      await actual.downloadBudget(options.syncId)
    }
  } catch (err) {
    // The API's messages don't name our env var, which is all a headless user can change.
    const code = (err as { code?: string })?.code
    if (err instanceof Error && (code === 'missing-key' || code === 'decrypt-failure')) {
      err.message += " Set or check ACTUAL_ENCRYPTION_PASSWORD (the budget file's encryption password)."
    }
    throw err
  }
}

export async function importTransactions(
  accountId: string,
  transactions: Parameters<typeof actual.importTransactions>[1],
): Promise<{ added: string[]; updated: string[] }> {
  const result = await actual.importTransactions(accountId, transactions)
  if (result.errors.length > 0) {
    throw new Error(`Import errors for account ${accountId}: ${JSON.stringify(result.errors)}`)
  }
  return { added: result.added, updated: result.updated }
}

export async function getAccounts(): Promise<Array<{ id: string; name: string; closed: boolean }>> {
  return actual.getAccounts()
}

export async function shutdownActual(): Promise<void> {
  await actual.shutdown()
}
