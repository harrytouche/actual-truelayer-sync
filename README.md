# actual-truelayer-sync

> **Fork of [sheppy/actual-truelayer-sync](https://github.com/sheppy/actual-truelayer-sync).** Differences from upstream:
>
> - The `@actual-app/api` client version can be set at build time to match your Actual server, via the `ACTUAL_API_VERSION` build arg. If it's unset, the version in `package-lock.json` is used.
> - The Docker image is built locally from this repo rather than pulled from ghcr.io:
>
>   ```yaml
>   actual-truelayer-sync:
>     build:
>       context: "https://github.com/harrytouche/actual-truelayer-sync.git"
>       args:
>         ACTUAL_API_VERSION: ${ACTUAL_VERSION}  # same value as your Actual server image tag
>   ```
>
>   After changing `ACTUAL_VERSION`, rebuild with `docker compose up -d --build`.
>
> - A standalone `add-bank.mjs` script for adding banks without Docker or `npm install` — see [Adding a Bank with add-bank.mjs](#adding-a-bank-with-add-bankmjs).

Syncs bank and credit card transactions from [TrueLayer](https://truelayer.com/) into [Actual Budget](https://actualbudget.org/). Runs as a scheduled Docker container.

**Supported banks:** Any UK bank supported by TrueLayer's Open Banking or OAuth connections (Monzo, Starling, Barclays, HSBC, Lloyds, NatWest, Santander, and many more).

---

## Prerequisites

- Docker and Docker Compose
- A self-hosted [Actual Budget](https://actualbudget.org/) instance
- A free [TrueLayer developer account](https://console.truelayer.com/)

---

## TrueLayer Setup

1. Sign up at the [TrueLayer Console](https://console.truelayer.com/).
2. Create a new project and switch it from **Sandbox** to **Live** mode to access real bank data.
3. Under **Redirect URIs**, add a redirect URI. The TrueLayer console provides a convenient one you can use:
   ```
   https://console.truelayer.com/redirect-page
   ```
4. Copy your **Client ID** and **Client Secret** — you'll need them shortly. The secret is only shown once, when it's created, so save it somewhere safe straight away.

### If your TrueLayer credentials don't work

- **The eye icon shows the secret identifier, not the secret.** Pasting the identifier as `TRUELAYER_CLIENT_SECRET` gives `{"error":"invalid_client"}`.
- **Lost the secret?** Click **Add secret** (up to six can be active at once), copy it as soon as it's created, and wait up to 15 minutes before using it. Don't delete the old secret while any container still uses it.
- **Live and Sandbox are separate**, each with its own Client ID and secret. Live uses `auth.truelayer.com`; Sandbox uses `auth.truelayer-sandbox.com`. This tool talks to Live.

To check your Client ID and secret without using a real bank login, send a fake code:

```
curl -X POST https://auth.truelayer.com/connect/token \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'client_id=[CLIENT_ID]' \
  --data-urlencode 'client_secret=[CLIENT_SECRET]' \
  --data-urlencode 'redirect_uri=https://console.truelayer.com/redirect-page' \
  --data-urlencode 'code=fake'
```

- `invalid_grant` — your credentials are fine (the code is fake, as expected).
- `invalid_client` — the Client ID or secret is wrong.

Keep the single quotes and `--data-urlencode`: secrets can contain `+` and shell special characters that would otherwise be mangled.

---

## Docker Setup

Copy the example files and fill in your values:

```
cp compose.example.yml docker-compose.yml
cp example.env .env
```

Edit `.env` — see the comments in `example.env` for what each variable does.

The key values you need are:

- `ACTUAL_SERVER_URL` — URL of your Actual Budget instance
- `ACTUAL_SERVER_PASSWORD` — your Actual Budget password
- `ACTUAL_SYNC_ID` — found under **Settings → Show advanced settings → ID** in Actual Budget
- `TRUELAYER_CLIENT_ID` and `TRUELAYER_CLIENT_SECRET` — from the TrueLayer Console
- `ACTUAL_ENCRYPTION_PASSWORD` (optional) — only if the budget file has end-to-end encryption turned on. See [Encrypted budgets](#encrypted-budgets).

### Encrypted budgets

`ACTUAL_ENCRYPTION_PASSWORD` is the budget file's end-to-end encryption password — the one set in Actual under **Settings → Show advanced settings → End-to-end encryption**. It is **not** the server password. Leave it unset (or empty) for unencrypted files.

Turning encryption on in Actual changes the budget's Sync ID. After you turn it on:

1. Copy the new Sync ID from **Settings → Show advanced settings** into `ACTUAL_SYNC_ID`.
2. Set `ACTUAL_ENCRYPTION_PASSWORD`.
3. Delete the cached budget folder inside your data directory — the folder named after the budget, e.g. `My-Finances-xxxxxxx`. **Don't** delete `config.json` or `state.json`.
4. Recreate the container:
   ```
   docker compose up -d actual-truelayer-sync
   ```

If you skip these steps you'll see one of:

- `Budget ... not found. Check the sync id` — `ACTUAL_SYNC_ID` is still the old one.
- `unknown problem opening <budget>` — usually the cached budget folder from before encryption.
- An error ending `Set or check ACTUAL_ENCRYPTION_PASSWORD` — the password is missing or wrong.

### Syncing multiple budget files

Each container syncs one budget file. To sync several, run one container per budget file. Each needs:

- its own `ACTUAL_SYNC_ID`
- its own `ACTUAL_ENCRYPTION_PASSWORD`, if that file is encrypted
- its own data volume

The TrueLayer Client ID and secret, and the Actual server URL and password, can be shared.

**Never share a data volume between containers.** Everything lives in `/app/data`:

- `config.json` would mix bank-to-account mappings from different budgets.
- Both containers would overwrite each other's `state.json`. TrueLayer rotates refresh tokens, so one lost write can break that bank connection until you set it up again.
- The cached Actual budget lives there too.

Example `docker-compose.yml` with two sync services sharing one Actual server:

```yaml
services:
  actual-truelayer-sync:
    build:
      context: "https://github.com/harrytouche/actual-truelayer-sync.git"
      args:
        ACTUAL_API_VERSION: ${ACTUAL_VERSION}
    restart: unless-stopped
    volumes:
      - ./actual-truelayer-sync/data:/app/data
    environment:
      - ACTUAL_SERVER_URL=${ACTUAL_SERVER_URL}
      - ACTUAL_SERVER_PASSWORD=${ACTUAL_SERVER_PASSWORD}
      - ACTUAL_SYNC_ID=${ACTUAL_SYNC_ID}
      - ACTUAL_ENCRYPTION_PASSWORD=${ACTUAL_ENCRYPTION_PASSWORD}
      - TRUELAYER_CLIENT_ID=${TRUELAYER_CLIENT_ID}
      - TRUELAYER_CLIENT_SECRET=${TRUELAYER_CLIENT_SECRET}
      - CRON_SCHEDULE=0 */4 * * *

  actual-truelayer-sync-2:
    build:
      context: "https://github.com/harrytouche/actual-truelayer-sync.git"
      args:
        ACTUAL_API_VERSION: ${ACTUAL_VERSION}
    restart: unless-stopped
    volumes:
      - ./actual-truelayer-sync/data-2:/app/data
    environment:
      - ACTUAL_SERVER_URL=${ACTUAL_SERVER_URL}
      - ACTUAL_SERVER_PASSWORD=${ACTUAL_SERVER_PASSWORD}
      - ACTUAL_SYNC_ID=${ACTUAL_SYNC_ID_2}
      - ACTUAL_ENCRYPTION_PASSWORD=${ACTUAL_ENCRYPTION_PASSWORD_2}
      - TRUELAYER_CLIENT_ID=${TRUELAYER_CLIENT_ID}
      - TRUELAYER_CLIENT_SECRET=${TRUELAYER_CLIENT_SECRET}
      - CRON_SCHEDULE=0 */4 * * *
```

Matching `.env`:

```
ACTUAL_VERSION=26.10.0
ACTUAL_SERVER_URL=http://192.168.1.10:5006
ACTUAL_SERVER_PASSWORD=
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=

# Budget 1
ACTUAL_SYNC_ID=
ACTUAL_ENCRYPTION_PASSWORD=

# Budget 2
ACTUAL_SYNC_ID_2=
ACTUAL_ENCRYPTION_PASSWORD_2=
```

An empty `ACTUAL_ENCRYPTION_PASSWORD` is treated as unset, so leave it blank for an unencrypted budget. If you set `container_name`, give each service a different one.

Set up banks separately for each container, so each gets its own bank consents and its own `state.json`. **Never copy `state.json` between containers.**

Authorising the same bank login for two containers is usually fine, but some banks allow only one active consent per app and revoke the older one. After setting up the second container, restart the first (it syncs on startup) and check its logs:

```
docker compose restart actual-truelayer-sync
```

```
docker compose logs -f actual-truelayer-sync
```

### Docker gotchas

**`EACCES: permission denied, mkdir 'data/...'`** — the container runs as the `node` user (UID 1000). If Docker created the host data folder for you, root owns it. Fix the owner:

```
sudo chown -R 1000:1000 ./actual-truelayer-sync/data
```

Or copy the owner from a folder that already works:

```
sudo chown -R --reference=./actual-truelayer-sync/data ./actual-truelayer-sync/data-2
```

Don't use `chmod 777` — the folder holds your bank refresh tokens.

**`.env` changes aren't picked up** — `docker compose restart` reuses the existing container and its old environment. Recreate it instead:

```
docker compose up -d actual-truelayer-sync
```

Add `--build` when building from source, so code changes are included too.

**Running a fork** — point `build:` at the fork (a git URL as above, or a local path such as `build: .`) instead of using `image: ghcr.io/sheppy/actual-truelayer-sync`, which is the upstream image.

---

## Adding Your First Bank Connection

The setup script handles the OAuth flow and writes `config.json` and `state.json` into your data directory interactively.

**Run via Docker (recommended):**

```
docker compose run --rm actual-truelayer-sync npm run setup
```

**Run locally** (requires Node 20+):

```
npm install
npm run dev:setup
```

The script will:

1. Ask whether this is a bank account or credit card connection
2. Build a TrueLayer auth URL for you to open in your browser
3. Ask you to paste back the redirect URL after authenticating
4. Let you select which accounts to add and map them to Actual Budget accounts
5. Write `config.json` and `state.json` to your data directory

Run it again for each additional bank you want to add.

---

## Adding a Bank with add-bank.mjs

A lighter alternative to the setup script: a single file with no dependencies (Node 22.18+) that doesn't connect to Actual Budget. It requests bank accounts and cards together in one login.

Run it from a folder containing a `.env` with `TRUELAYER_CLIENT_ID` and `TRUELAYER_CLIENT_SECRET`:

```
node --env-file=.env add-bank.mjs
```

The script will:

1. Print a TrueLayer auth URL to open in your browser
2. Ask you to paste back the redirect URL (or just the `code`)
3. Exchange the code for tokens and fetch the bank's accounts and cards
4. Ask for a connection name
5. Create `tmp/config.json` and `tmp/state.json` in the current folder, or add the new bank to them if they already exist

Run it once per bank — both files grow. Then, in `tmp/config.json`, delete any accounts you don't want and replace each `"TODO"` with the Actual Budget account ID (found in the URL when viewing an account in Actual Budget). Copy both files into your data volume and restart the container.

`state.json` holds live refresh tokens — keep it private. `tmp/` is gitignored.

---

## Adding a Connection Manually

If you prefer not to use the setup script, you can do this with curl.

**Step 1 — Authenticate with your bank**

Open this URL in your browser (substituting your Client ID and choosing the appropriate scope):

For bank accounts:

```
https://auth.truelayer.com/?response_type=code&client_id=[CLIENT_ID]&scope=accounts%20balance%20transactions%20offline_access&redirect_uri=https://console.truelayer.com/redirect-page&providers=uk-ob-all%20uk-oauth-all&response_mode=query
```

For credit/charge cards:

```
https://auth.truelayer.com/?response_type=code&client_id=[CLIENT_ID]&scope=cards%20balance%20transactions%20offline_access&redirect_uri=https://console.truelayer.com/redirect-page&providers=uk-ob-all%20uk-oauth-all&response_mode=query
```

After authenticating with your bank, you'll be redirected to a URL containing a `code` query parameter.

**Step 2 — Exchange the code for tokens**

```
curl -X POST https://auth.truelayer.com/connect/token \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'client_id=[CLIENT_ID]' \
  --data-urlencode 'client_secret=[CLIENT_SECRET]' \
  --data-urlencode 'redirect_uri=https://console.truelayer.com/redirect-page' \
  --data-urlencode 'code=[CODE]'
```

Keep the single quotes and `--data-urlencode` so a `+` or shell special characters in the secret aren't mangled.

The response contains a `refresh_token`. Add this to `state.json` under the connection name.

**Step 3 — Discover account IDs**

Add a connection to `config.json` with an empty `accounts` array and start the container. The first sync will log all available TrueLayer account IDs for that connection:

```
[My Bank] Unmatched TrueLayer account (not in config):
  └ My Current Account (TRANSACTION) — trueLayerId: abc123...
  └ My Savings Account (SAVINGS)     — trueLayerId: def456...
```

Add the IDs you want to `config.json` along with the corresponding Actual Budget account IDs (found in the URL when viewing an account in Actual Budget), then restart.

---

## Config Reference

Configuration is split across two files in your data directory.

### `config.json`

Defines which accounts to sync and how. See `config.example.json` for a full example.

| Field                    | Required | Description                                                                                                                                                                                                                                                      |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                | Yes      | Must be `2`                                                                                                                                                                                                                                                      |
| `includeCategoryInNotes` | No       | Appends TrueLayer transaction category to the notes field (default: `false`)                                                                                                                                                                                     |
| `lookbackDays`           | No       | How many days back to fetch on first sync for an account (default: `14`). Note: TrueLayer currently appears to ignore the `from` date parameter and returns all available transactions regardless — this field is retained in case TrueLayer honour it in future |
| `connections`            | Yes      | Array of bank connections (see below)                                                                                                                                                                                                                            |

**Connection fields:**

| Field      | Required | Description                                                       |
| ---------- | -------- | ----------------------------------------------------------------- |
| `name`     | Yes      | Unique label, used in logs and to match state                     |
| `isCard`   | No       | Set to `true` if this connection is a credit/charge card provider |
| `accounts` | Yes      | Array of accounts to sync (empty array = ID discovery mode)       |

**Account fields:**

| Field          | Required | Description                                                                                                         |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `trueLayerId`  | Yes      | TrueLayer `account_id` for this account                                                                             |
| `actualId`     | Yes      | Actual Budget account ID                                                                                            |
| `friendlyName` | Yes      | Label used in logs                                                                                                  |
| `flip`         | No       | Inverts transaction amounts. Credit card accounts have amounts flipped automatically; use `flip: false` to override |
| `isCard`       | No       | Overrides the connection-level `isCard` for this specific account                                                   |

### `state.json`

Stores refresh tokens and last sync dates. Written by the app and the setup script — you should not need to edit this manually.

See `state.example.json` for the expected structure.

> **Note:** Both files are excluded from Docker image builds. Mount them via the `./actual-truelayer-sync/data:/app/data` volume in your compose file.

---

## Running

Start the container:

```
docker compose up -d
```

By default the sync runs once on startup and exits. Set `CRON_SCHEDULE` in your `.env` to run on a schedule:

```
CRON_SCHEDULE=0 */4 * * *   # Every 4 hours
```

Set `TZ` to ensure the schedule fires at the expected local time:

```
TZ=Europe/London
```

View logs:

```
docker compose logs -f actual-truelayer-sync
```

---

## Migrating from v1

If you have an existing `config.json` from before the config/state split, see [MIGRATION.md](MIGRATION.md).

---

## Troubleshooting

| Error                                                 | Cause                                                       | Fix                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Budget ... not found. Check the sync id`             | `ACTUAL_SYNC_ID` is stale (e.g. encryption was turned on)   | Copy the current Sync ID into `ACTUAL_SYNC_ID` and recreate the container                                     |
| `unknown problem opening <budget>`                    | Cached budget folder from before encryption was turned on   | Delete the budget folder in the data directory (not `config.json`/`state.json`) and recreate the container   |
| Error ending `Set or check ACTUAL_ENCRYPTION_PASSWORD` | Budget is encrypted and the password is missing or wrong   | Set `ACTUAL_ENCRYPTION_PASSWORD` to the file's encryption password (not the server password)                 |
| `EACCES: permission denied, mkdir 'data/...'`         | Host data folder owned by root; container runs as UID 1000 | `sudo chown -R 1000:1000 <host data folder>`                                                                  |
| `.env` change has no effect                           | `docker compose restart` keeps the old environment          | `docker compose up -d <service>` (add `--build` when building from source)                                    |
| `{"error":"invalid_client"}`                          | Wrong Client ID or secret, often the secret identifier      | Create a new secret with **Add secret**, copy it at creation, wait up to 15 minutes                           |
| A bank connection stops working after adding another container | The bank allows one consent per app and revoked the older one | Set that bank up again in the first container                                                      |

See [Encrypted budgets](#encrypted-budgets), [Docker gotchas](#docker-gotchas) and [If your TrueLayer credentials don't work](#if-your-truelayer-credentials-dont-work) for details.

---

## Use of AI

This project has made use of AI tooling throughout development:

- **Code review** — reviewing sync logic, error handling, and edge cases; catching bugs and suggesting improvements
- **Test writing** — generating unit tests for config loading, sync logic, and transaction mapping
- **The setup script** — `scripts/setup.ts`, including the OAuth flow, interactive prompts, and file writing logic, was written with AI assistance
- **Documentation** — this README was written with AI assistance

The intent is to be transparent about this. All AI-generated code has been reviewed and tested by the author.

---

## License

MIT
