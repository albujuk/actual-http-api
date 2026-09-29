# CLAUDE.md

Node.js HTTP bridge that wraps `@actual-app/api` so any HTTP client can read and write an Actual Budget over HTTP+JSON. Actual has no REST API. The only programmatic interface is this Node library, which downloads the budget into a local SQLite cache and syncs changes back.

`plan.md` holds the full design, the endpoint contract, the roadmap and the security checklist. Read it before adding endpoints. Its single-file `server.ts` is a reference prototype only. The real code is split by responsibility (see Architecture).

## Commands

```sh
pnpm dev        # tsx watch, loads .env (required)
pnpm build      # tsc -p tsconfig.build.json -> dist/ (src only, with source maps)
pnpm typecheck  # tsc --noEmit over src and test
pnpm test       # vitest run
pnpm start      # node dist/main.js, loads .env if present
```

Run `pnpm typecheck` and `pnpm test` after every change. No linter or formatter yet. `tsconfig.json` is type-check only; `tsconfig.build.json` extends it for the emit.

## Stack

- Node 22.9+ (`engines`). ESM (`"type": "module"`), TypeScript 7 with `NodeNext` resolution, `verbatimModuleSyntax` and `noUncheckedIndexedAccess`. **Relative imports must use the `.js` extension** (`./types.js`), and type-only imports use `import type`.
- Vitest for unit tests in `test/`.
- Fastify 5, with pino logging via `logger: true`.
- `@actual-app/api` is pinned to an exact version. ActualQL and API details shift between releases, so re-check call signatures after an upgrade.
- pnpm. `onlyBuiltDependencies` allows native builds only for `better-sqlite3` and `esbuild`.

## Architecture

```
src/
  main.ts                  composition root: wires everything, start-up and shutdown order
  config.ts                loadConfig(env) -> typed Config; throws on missing or out-of-range vars
  lifecycle.ts             onShutdown(): runs once on SIGTERM/SIGINT or a fatal error, bounded by a timeout
  actual/
    types.ts               narrow interfaces: Connection, BudgetLoader, BudgetCatalog, BudgetStatus, Syncable
    errors.ts              NotReadyError (mapped to 503)
    actual-connection.ts   ActualConnection: init/shutdown, list budgets, load one. One per process
    budget-sync.ts         BudgetSync: Syncable capability, guarded by BudgetStatus
    budget-selection.ts    pure toBudgetSummaries() + selectBudget() + BudgetSelectionError
  http/
    app.ts                 buildApp(deps): creates Fastify, registers error handlers and route plugins
    error-handler.ts       JSON { error } responses; 5xx never carry the raw message
    routes/*.ts            each route file is a factory (dep) => FastifyPluginAsync
  sync/
    periodic-sync.ts       PeriodicSync: chained setTimeout around a Syncable; implements SyncStatus
test/                      Vitest unit tests for the pure logic and PeriodicSync
```

Conventions to keep:

- **Dependency injection through `main.ts` only.** Modules receive their collaborators and never import singletons. Only `main.ts` calls `loadConfig(process.env)`.
- **Depend on the narrowest interface.** Routes and `PeriodicSync` take `BudgetStatus`, `BudgetCatalog` or `Syncable`, never `ActualConnection`. For a new capability, add an interface in `actual/types.ts` and implement it in a **new class** under `actual/` (like `BudgetSync`: it takes `BudgetStatus` and throws if no budget is loaded). Do not grow `ActualConnection`, which only owns connection and budget-load state. Inject the capability into a new route factory registered in `buildApp`.
- **Keep `@actual-app/api` behind `actual/`.** The library is a process-wide singleton, so the `ActualConnection` constructor throws on a second instance. Budget selection policy lives in the composition root, not in `actual/`. Keep pure logic, such as `selectBudget`, in its own side-effect-free functions.
- Private state uses `#fields`. Timers and errors go through injected `onError` callbacks, which wire to `app.log`.

## Runtime behavior

- Start-up order: `app.listen()` runs **before** `connection.connect()`, then `main.ts` calls `selectBudget(await connection.listBudgets(), ...)` and `connection.load(budget)`. `listBudgets()` needs only `connect()`, not a loaded budget; before that it throws `NotReadyError` (503). `/healthz` returns `503 {status:"starting"}` until the budget has loaded, then `200 {status:"ok", budget, lastSyncAt?, lastSyncError?}`. It stays 200 when syncs fail. Periodic sync starts after the budget loads. `start()` checks an `AbortSignal` between steps. Any start-up failure calls `process.exit(1)`, unless shutdown has already begun.
- Budget selection (`selectBudget`): `ACTUAL_SYNC_ID` wins. Otherwise the bridge matches on `ACTUAL_BUDGET_NAME`. If neither is set, it auto-picks when the server has exactly one budget. Zero or several matches throw an error that lists the available budgets.
- `listBudgets()` keeps only remote files (`state: "remote"`), deduped by `groupId`. `api.getBudgets()` also returns local cache folders, which can be stale.
- Shutdown order: abort start-up and await its current step, `await periodicSync.stop()` (waits for a running sync), close the HTTP server, then `connection.close()`, which does a final `api.sync()` (only if a budget loaded) and then `api.shutdown()` (if connected). `unhandledRejection`/`uncaughtException` log and run the same shutdown with exit code 1. The whole shutdown is capped at `SHUTDOWN_TIMEOUT_MS` (10s in `main.ts`), after which it exits 1.

Current endpoints: `GET /healthz`, `GET /budgets`.

## Config (env)

| Var | Default | Notes |
|---|---|---|
| `ACTUAL_SERVER_URL` | required | |
| `ACTUAL_PASSWORD` | required | |
| `ACTUAL_SYNC_ID` / `ACTUAL_BUDGET_NAME` | unset | Budget selection, see above |
| `HOST` | `127.0.0.1` | Keep the bridge private. It has full write access to the budget |
| `PORT` | `3000` | Integer 1–65535. `.env.example` uses `3001` |
| `DATA_DIR` | `./data` | Local budget cache (gitignored). Created on open |
| `SYNC_INTERVAL_MS` | `60000` | Integer 1000–2147483647. Delay between the end of one sync and the start of the next |

Empty strings count as unset. Invalid values stop start-up with a one-line error. Never commit `.env`.

## Invariants for upcoming work (from the plan)

- **Run a single bridge instance per budget.** The local SQLite copy has a single writer.
- **Serialize writes** behind an async mutex, and `sync()` after each write.
- Money is integer minor units (expenses negative). Dates are `YYYY-MM-DD` and months are `YYYY-MM`. Use `utils.amountToInteger` rather than hand-rolled rounding.
- Prefer `importTransactions` (it reconciles, runs rules and dedupes by `imported_id`) over `addTransactions` for user input.
- Not built yet: bearer-token auth (`BRIDGE_TOKEN` in an `onRequest` hook, exempting `/healthz`), read and write endpoints, Fastify schema validation, mapping of `@actual-app/api` errors in the central error handler (it only knows `NotReadyError` so far), end-to-end encrypted budgets (TBD, `downloadBudget` takes `{ password }`).

## Rules

Each rule guards against a bug class found in review. Follow them in every change.

- **Parse env vars only through the `config.ts` helpers.** Never write `Number(x) || default`: it accepts negatives, and it silently turns `NaN` and `0` into the default. Every number gets an explicit integer range. Keep timer delays within 1..2_147_483_647, because Node turns anything outside that range into 1ms.
- **No `setInterval` around async work.** Schedule the next run with `setTimeout` after the previous one settles. Every background task keeps its in-flight promise, and its `stop()` awaits that promise.
- **Shutdown awaits all in-flight work before `connection.close()`.** That covers start-up steps, syncs and, later, writes behind the mutex. Start-up checks the abort signal between steps. Every exit goes through `lifecycle.ts` and stays bounded by the timeout. Don't call `process.exit` anywhere else, except for config and start-up failures in `main.ts`.
- **Never send a raw `err.message` in a 5xx response.** Throw typed errors and let `http/error-handler.ts` map them. A capability used before the connection or budget is ready throws `NotReadyError` (503), never a plain `Error`. New error types get a mapping there.
- **Custom error classes set `this.name`.**
- **Log through pino only.** No `console.*`. The one exception is the config error in `main.ts`, before the logger exists. `@actual-app/api` runs with `verbose: false`. Never log config values, passwords or unredacted request headers.
- **Keep docs in sync in the same change.** A new or changed env var, default, endpoint, response shape, error format or roadmap stage updates `.env.example`, README.md, CLAUDE.md and plan.md together. Defaults in `.env.example` and in the docs match the code.
- **`engines.node` must cover every Node flag and API** used in scripts and code (`--env-file-if-exists` needs 22.9).
- **Don't use the non-null `!` to satisfy `noUncheckedIndexedAccess` in `src/`.** Destructure or check instead. `!` is fine in tests.
- **Pure logic lives in side-effect-free functions with a Vitest test.** Examples: selection, parsing, and mapping API results (`toBudgetSummaries`). Anything with timers is tested with fake timers.
- **Check `@actual-app/api` behavior in `node_modules/@actual-app/api/dist/index.js`, not from memory.** Known facts for 26.9.0:
  - `getBudgets()` returns local cache folders (no `state`) plus remote files (`state: "remote"`, deleted files excluded).
  - `shutdown()` syncs but swallows errors.
  - `init()` logs to the console unless you pass `verbose: false`.
