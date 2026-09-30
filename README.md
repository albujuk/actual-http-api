# actual-api

A small, long-running HTTP server that exposes an [Actual Budget](https://actualbudget.org/) budget over HTTP + JSON.

Actual has no REST API. The only first-party programmatic interface is the Node.js package [`@actual-app/api`](https://actualbudget.org/docs/api/). It downloads a budget into a local SQLite copy, runs Actual's engine against it in-process, and syncs changes back to the Actual server. This service wraps that package in a Fastify server. It loads the budget once, keeps it in memory, and serves requests against it. Any HTTP client can then work with the budget, whatever language it's written in.

To the Actual server, this service looks like any other Actual client.

```
HTTP client ──HTTP+JSON──▶ actual-api (@actual-app/api, budget in memory) ──sync──▶ Actual server
                                   │
                                   └── DATA_DIR (local SQLite cache)
```

## Status

The service skeleton and the read endpoints work: config, budget loading, readiness, periodic sync, graceful shutdown, and reads for accounts, balances, transactions, categories, payees, budget months and name lookup. The write endpoints are planned but not built yet. See [Endpoints](#endpoints) and [Roadmap](#roadmap).

## Requirements

- Node.js 22.9+
- pnpm
- A reachable Actual server, and its password

## Getting started

```sh
pnpm install
cp .env.example .env   # then fill in ACTUAL_SERVER_URL and ACTUAL_PASSWORD
pnpm dev
```

Check that the service is up:

```sh
curl http://127.0.0.1:3001/healthz
# {"status":"ok","budget":"My Budget","lastSyncAt":"2026-09-30T12:00:00.000Z"}
```

Browse the API docs at <http://127.0.0.1:3001/docs>. `pnpm dev` runs in development, where the docs are on by default.

### Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Runs from source with `tsx watch` and `NODE_ENV=development`. Requires `.env` |
| `pnpm build` | Compiles TypeScript into `dist/` |
| `pnpm start` | Runs `dist/main.js`, loading `.env` if one exists |
| `pnpm typecheck` | Type-checks `src` and `test` without emitting |
| `pnpm test` | Runs the Vitest unit tests |

## Configuration

All configuration comes from environment variables. An empty value counts as unset.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACTUAL_SERVER_URL` | yes | | URL of the Actual sync server |
| `ACTUAL_PASSWORD` | yes | | Actual server password |
| `ACTUAL_SYNC_ID` | no | | Sync ID of the budget to load |
| `ACTUAL_BUDGET_NAME` | no | | Name of the budget to load |
| `NODE_ENV` | no | `production` | `development` or `production`. Sets the default for `DOCS_ENABLED`. `pnpm dev` sets `development` |
| `HOST` | no | `127.0.0.1` | Interface to bind |
| `PORT` | no | `3000` | Port to listen on (`.env.example` sets `3001`) |
| `DATA_DIR` | no | `./data` | Directory for the local budget cache |
| `SYNC_INTERVAL_MS` | no | `60000` | Interval for background sync with the server |
| `DOCS_ENABLED` | no | on in development, off in production | Serve Swagger UI and the OpenAPI spec under `/docs`. Overrides the `NODE_ENV` default |

Numeric variables must be integers in range: `PORT` 1–65535, `SYNC_INTERVAL_MS` 1000–2147483647. `DOCS_ENABLED` must be `true` or `false`. `NODE_ENV` must be `development` or `production`: `@actual-app/api` reads it too, and `test` would turn off its backups and normal sync. In development, Actual also lists GoCardless demo banks. An invalid value stops start-up with a one-line error.

### Choosing a budget

1. If `ACTUAL_SYNC_ID` is set, the service loads that budget. It takes priority over `ACTUAL_BUDGET_NAME`.
2. Otherwise, if `ACTUAL_BUDGET_NAME` is set, the service loads the budget with that exact name.
3. Otherwise, if the server has exactly one budget, the service loads it.

Only budgets that exist on the server count. Stale copies in the local cache are ignored. If no budget matches, or more than one does, start-up fails with an error that lists the available budgets by name and sync ID. `GET /budgets` returns the same list.

## Lifecycle

1. **Boot.** The service reads config from the environment and starts listening. `/healthz` returns `503` at this point.
2. **Init.** It calls `api.init()`, picks a budget, and runs `api.downloadBudget()`. This is slow, since it needs the network and a full database load. It runs once. When it finishes, `/healthz` returns `200`.
3. **Serve.** It handles requests against the in-memory budget. Reads run directly. Writes run one at a time through a queue, and each ends with `api.sync()`.
4. **Periodic sync.** It calls `api.sync()` `SYNC_INTERVAL_MS` after the previous sync finishes, so syncs never overlap. Periodic syncs go through the same queue as writes, so a sync never runs in the middle of a write. The service picks up changes from other devices and bank sync even when it receives no writes. A failed sync is logged and reported in `/healthz` as `lastSyncError`, and the next one is still scheduled.
5. **Shutdown.** On `SIGTERM` or `SIGINT`, it waits for any in-progress start-up step, stops the timer and waits for a running sync, closes the HTTP server (in-flight requests finish), waits for queued writes, runs a final `api.sync()`, and then calls `api.shutdown()`. Skipping this step can lose the last write or corrupt the cache. An unhandled error triggers the same shutdown and exits with code 1. If shutdown takes longer than 10 seconds, the process exits with code 1.

Any failure during start-up exits the process with code 1. Let a supervisor (for example systemd) restart it rather than running with a half-loaded budget.

## Endpoints

### Available

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | `503 {"status":"starting"}` until the budget loads, then `200 {"status":"ok","budget":"<name>","lastSyncAt":"<ISO time>","lastSyncError":"<message>"}`. The sync fields are absent until the first sync or failure. It stays `200` when syncs fail |
| `GET` | `/budgets` | Budgets on the server: `[{"syncId": "...", "name": "..."}]`. `503` until the service has connected |
| `GET` | `/accounts` | All accounts: `[{"id","name","offbudget","closed","balance_current","account_group_id"}]` |
| `GET` | `/accounts/:id` | One account. `404` if the id is unknown |
| `GET` | `/accounts/:id/balance` | `{"balance": <minor units>}`. Optional `?cutoff=YYYY-MM-DD` (inclusive, defaults to today). `404` if the id is unknown |
| `GET` | `/accounts/:id/transactions` | The account's transactions. Optional `?start=` and `?end=` (`YYYY-MM-DD`, inclusive). Splits are grouped: a parent carries its parts in `subtransactions`. `404` if the id is unknown |
| `GET` | `/categories` | All categories, flat. Optional `?hidden=true\|false` |
| `GET` | `/category-groups` | Category groups with their categories nested. Optional `?hidden=true\|false` |
| `GET` | `/payees` | All payees |
| `GET` | `/budget/months` | The months the budget covers: `["2026-01", ...]` |
| `GET` | `/budget/:month` | Budget figures for `YYYY-MM`: totals plus budgeted, spent, balance and carryover per category. `404` for a month outside the budget |
| `GET` | `/id?type=&name=` | `{"id": "..."}` for an exact name. `type` is `accounts`, `categories`, `payees` or `schedules`. `404` if no match |
| `GET` | `/docs` | Swagger UI. Only when docs are enabled (see `DOCS_ENABLED`) |
| `GET` | `/docs/json`, `/docs/yaml` | OpenAPI 3.1 spec. Only when docs are enabled |

The OpenAPI spec is generated from the route schemas, so it always matches the code. Responses are serialized through the same schemas, so fields a schema doesn't declare are never sent.

### Errors

Errors are JSON `{"error": "<message>"}`:

- `503 {"error":"not ready"}`: the service is still connecting or loading the budget. Every budget endpoint returns it until `/healthz` is `200`.
- `400`: the request failed schema validation (bad id, date, month or query value). The message names the field.
- `404`: the route, or the account, month or name it refers to, does not exist (for example `{"error":"account not found"}`).
- `500 {"error":"internal error"}`: details go to the log only, never to the client.

### Planned

| Method | Path | Maps to | Notes |
|---|---|---|---|
| `POST` | `/accounts/:id/transactions/import` | `importTransactions` | Reconciles, runs rules, dedupes |
| `POST` | `/accounts/:id/transactions/add` | `addTransactions` | Raw insert, no reconciliation |
| `PATCH` | `/transactions/:id` | `updateTransaction` | |
| `DELETE` | `/transactions/:id` | `deleteTransaction` | |
| `POST` | `/budget/:month/set-amount` | `setBudgetAmount` | Body: `{ categoryId, amount }` |
| `POST` | `/query` | `runQuery` + `q(...)` | ActualQL passthrough, limited to an allowlist of tables |
| `POST` | `/bank-sync` | `runBankSync` | Optional body: `{ accountId }` |

## Data conventions

- **Amounts are integers in minor units** (usually cents), in both directions. `$120.30` is `12030`. Expenses are negative and income is positive. The service uses Actual's own `utils.amountToInteger` and `utils.integerToAmount` for conversion, so currencies without two decimal places round correctly.
- **Dates are `YYYY-MM-DD` and months are `YYYY-MM`.** Clients should compute "today" in the user's timezone, not UTC.
- **Prefer `import` over `add`.** `importTransactions` reconciles against existing transactions, runs rules (auto-categorization) and creates the other side of transfers. Send an `imported_id` with each transaction to make imports idempotent, since the same id is never added twice. Use `add` only for raw bulk loads.
- **Split transactions** have a parent row (the total) and child rows (the parts). `GET /accounts/:id/transactions` groups them: the top level holds parents and plain transactions, and each parent lists its parts in `subtransactions`. Sum the top level or the parts, never both, or the totals double-count.

## Operational constraints

- **Run one instance per budget.** The service mutates a local SQLite copy and syncs it. Two replicas against the same budget would diverge and cause sync conflicts.
- **Writes are serialized.** Every mutating endpoint runs through one queue, together with the periodic sync, and ends with `api.sync()`, so concurrent requests can't interleave.
- **Persist `DATA_DIR`.** Without a persistent volume, every restart downloads the whole budget again.
- **Pin `@actual-app/api`.** ActualQL is mostly undocumented upstream and changes between releases. Re-check the `q(...)` builder methods after every upgrade.

## Security

This service can read and rewrite your entire budget. Treat it like a database, not a public API.

- **Keep it private.** It binds to `127.0.0.1` by default. Never publish its port to the internet.
- **Authenticate callers.** A shared bearer token (`BRIDGE_TOKEN`, checked on every route except `/healthz`) is planned. Until it ships, rely on network isolation alone. The `/docs` routes describe the API but return no budget data. They are off in production unless `DOCS_ENABLED=true`.
- **Use TLS across hosts.** If clients run on another host, put the service behind a TLS reverse proxy, or use mTLS.
- **Keep secrets in the environment, never in git.** This covers the server password and the bridge token. `.env` is gitignored.
- **Verify TLS to the Actual server.** For self-signed or private CA certificates, set `NODE_EXTRA_CA_CERTS`. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0` outside a fully trusted network, because it turns off all certificate verification.
- **Don't log secrets**, and don't return them in error responses.
- **End-to-end encrypted budgets are not supported yet (TBD).** Use a budget file without E2E encryption.
- **Back up the Actual server.** It remains the source of truth.

## Deployment

TBD. Packaging (container image or other) is not decided yet. Whatever it ends up being must:

- run exactly one instance per budget,
- restart the process on exit (start-up failures exit with code 1),
- keep `DATA_DIR` on persistent storage,
- keep the port on a private network,
- use `GET /healthz` (`200` once the budget has loaded) as the readiness check.

## Roadmap

| Done | Stage | Goal | Done when |
|---|---|---|---|
| [x] | 0. Prereqs | Node 22.9+, pnpm, a reachable Actual server | `curl` the server |
| [x] | 1. Skeleton | init, budget download, `/healthz`, `/budgets`, periodic sync, graceful shutdown | `/healthz` returns ok after warm-up |
| [x] | 2. Read endpoints | accounts, balance, transactions, categories, payees, budget month, `/id` | `curl` returns real data |
| [ ] | 3. Write endpoints | import, add, update, delete, set-amount, with a write lock and sync after each write | A posted transaction appears in the Actual UI |
| [ ] | 4. Query and bank sync | Constrained `/query`, `/bank-sync` | Only allowlisted tables are queryable |
| [ ] | 5. Hardening | Bearer-token auth, schema validation on every route (TypeBox request and response schemas done for existing routes), central error handler (basic version done), no secrets in logs | Security checklist is met |
| [ ] | 6. Deploy (TBD) | Packaging and restart policy (approach not decided), persistent `DATA_DIR` | Survives a reboot |
| [ ] | 7. Tests and observability | Unit tests (done for config, budget selection, periodic sync, error translation, dates; amounts to come), a smoke test against a throwaway budget, structured logs | CI is green |

## Project layout

```
src/
  main.ts        composition root: wires the modules, runs start-up and shutdown
  config.ts      environment → validated, typed config
  lifecycle.ts   process signals and fatal errors → one graceful shutdown
  core/          shared infrastructure: Actual connection, error translation and the
                 write queue, Fastify app setup and error mapping, background sync
  features/      one folder per resource (accounts, transactions, …): its types,
                 budget access, HTTP routes and tests together
test/support/    shared test helpers (tests sit next to the code as *.test.ts)
```
