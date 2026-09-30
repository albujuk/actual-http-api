# CLAUDE.md

Node.js HTTP bridge that wraps `@actual-app/api` so any HTTP client can read and write an Actual Budget over HTTP+JSON. Actual has no REST API. The only programmatic interface is this Node library, which downloads the budget into a local SQLite cache and syncs changes back.

`plan.md` holds the full design, the endpoint contract, the roadmap and the security checklist. Read it before adding endpoints. Its single-file `server.ts` is a reference prototype only. The real code is split by responsibility (see Architecture).

## Commands

```sh
pnpm dev        # tsx watch, NODE_ENV=development, loads .env (required)
pnpm build      # tsc -p tsconfig.build.json -> dist/ (src only, with source maps)
pnpm typecheck  # tsc --noEmit over src and test
pnpm test       # vitest run
pnpm start      # node dist/main.js, loads .env if present
```

Run `pnpm typecheck` and `pnpm test` after every change. No linter or formatter yet. `tsconfig.json` is type-check only; `tsconfig.build.json` extends it for the emit.

## Stack

- Node 22.9+ (`engines`). ESM (`"type": "module"`), TypeScript 7 with `NodeNext` resolution, `verbatimModuleSyntax` and `noUncheckedIndexedAccess`. **Relative imports must use the `.js` extension** (`./types.js`), and type-only imports use `import type`.
- Vitest. Tests sit next to the code as `*.test.ts` (excluded from the build); shared helpers live in `test/support/`.
- Fastify 5, with pino logging via `logger: true`.
- Route schemas in TypeBox (`typebox` 1.x, not `@sinclair/typebox`) via `@fastify/type-provider-typebox`. `@fastify/swagger` turns them into the OpenAPI 3.1 spec and `@fastify/swagger-ui` serves it.
- `@actual-app/api` is pinned to an exact version. ActualQL and API details shift between releases, so re-check call signatures after an upgrade.
- pnpm. `onlyBuiltDependencies` allows native builds only for `better-sqlite3` and `esbuild`.

## Architecture

```
src/
  main.ts                  composition root: wires everything, start-up and shutdown order
  config.ts                loadConfig(env) -> typed Config; throws on missing or out-of-range vars
  lifecycle.ts             onShutdown(): runs once on SIGTERM/SIGINT or a fatal error, bounded by a timeout
  app.test.ts              whole-app tests: OpenAPI spec covers every feature, docs toggle, 503/5xx mapping
  core/                    shared infrastructure. Never imports from features/
    dates.ts               pure parseDay(): YYYY-MM-DD -> local-midnight Date
    actual/
      types.ts             connection-level types + interfaces: BudgetSummary, Connection, BudgetLoader,
                           BudgetCatalog, BudgetStatus, Syncable, WriteQueue
      errors.ts            NotReadyError (503), NotFoundError (404), InvalidInputError (400, unknown id in a body),
                           ActualApiError (unmapped library error, 500)
      api-errors.ts        pure translateApiError() + callApi(): library APIError objects -> typed errors
      guard.ts             requireLoaded(status): throws NotReadyError before the budget loads
      actual-connection.ts ActualConnection: init/shutdown, list budgets, load one. One per process
      write-queue.ts       BudgetWriteQueue: WriteQueue + Syncable. Serializes writes (each followed by a sync) and
                           periodic syncs, guarded by BudgetStatus; close() drains it and rejects new work (503)
      budget-selection.ts  pure toBudgetSummaries() + selectBudget() + BudgetSelectionError
    http/
      app.ts               buildApp(modules, options): creates Fastify, error handlers, docs, then each module's plugin. Knows no concrete route
      route-module.ts      RouteModule { tag, plugin }: the abstraction app.ts and docs depend on
      docs.ts              registerDocs(): @fastify/swagger + Swagger UI at /docs, tags from the modules. Registers before routes
      schemas.ts           cross-cutting TypeBox schemas only (ErrorResponse, commonErrors, badRequest, invalidInput,
                           notFound, notReady, Id/IdField(description)/IdParams, Day(description), Amount(description))
      error-handler.ts     JSON { error } responses; 5xx never carry the raw message
    sync/
      periodic-sync.ts     PeriodicSync: chained setTimeout around a Syncable; implements SyncStatus
  features/<name>/         one folder per resource: accounts, transactions, categories, payees, budget-months,
                           ids, budgets, health. Each holds what it has of:
    <name>-types.ts        the feature's data types + its narrow reader interface (AccountReader, ...)
    <name>-queries.ts      read capability class (AccountQueries, ...), guarded by BudgetStatus, library calls in callApi
                           (ids: name-resolver.ts, ApiNameResolver over getIDByName)
    <name>-writer.ts       (transactions) write capability class (ApiTransactionWriter): takes the WriteQueue plus
                           readers, checks ids inside the queue and throws NotFoundError (path) or
                           InvalidInputError (body) before writing
    <name>-routes.ts       factory (deps) => RouteModule, owning its TypeBox schemas and OpenAPI tag
    budget-month.ts        (budget-months only) pure toBudgetMonth(): normalizes carryover cells to booleans
    *.test.ts              the feature's tests, next to the code
test/support/              shared test helpers only: fixtures + fakeStatus(), testApp(), describeLibraryCalls()
```

Conventions to keep:

- **Dependency injection through `main.ts` only.** Modules receive their collaborators and never import singletons. Only `main.ts` calls `loadConfig(process.env)`.
- **Depend on the narrowest interface.** Routes and `PeriodicSync` take `BudgetStatus`, `BudgetCatalog` or `Syncable`, never `ActualConnection`. For a new capability, add an interface in the feature's `<name>-types.ts` and implement it in a **new class** in that feature folder (like `AccountQueries`: it takes `BudgetStatus` and throws if no budget is loaded). Connection-level capabilities (like `BudgetWriteQueue`) go in `core/actual/`. Write capabilities take the `WriteQueue`, never the connection, and run all their checks and library calls inside one `queue.write()`. Do not grow `ActualConnection`, which only owns connection and budget-load state. Inject the capability into a new route factory registered in `buildApp`.
- **Import `@actual-app/api` only in `core/actual/` and in a feature's capability classes** (`*-queries.ts`, `name-resolver.ts`, `*-writer.ts`). Route files never import it. The library is a process-wide singleton, so the `ActualConnection` constructor throws on a second instance. Budget selection policy lives in the composition root, not in `core/actual/`. Keep pure logic, such as `selectBudget`, in its own side-effect-free functions.
- **Add a resource as a new `features/<name>/` folder** with its types, capability class, `<name>-routes.ts` returning a `RouteModule`, and tests. Add the module to the `buildApp([...])` list in `main.ts` and its path and tag to the spec test in `src/app.test.ts`. Nothing in `core/` changes: `app.ts`, `docs.ts` and `schemas.ts` stay untouched. The module keeps its TypeBox schemas and its tag in its own file; only schemas used by several modules go in `schemas.ts`.
- **Dependency direction: features import `core/`, `core/` never imports a feature.** Between features only `import type` is allowed (transactions uses `AccountReader`, `CategoryReader` and `PayeeReader`, budget-months uses `Category`). All runtime wiring stays in `main.ts`. No `index.ts` barrels: import modules directly.
- **Write bodies are objects with `additionalProperties: false`**, so Fastify strips unknown fields before the handler (it strips, it doesn't reject). Amounts use `Amount(...)`. Writes answer `{ ok: true }` unless the library returns something useful (import returns `{ added, updated }`).
- **Every route declares a TypeBox `schema`** with `tags: [tag.name]`, `summary`, and a `response` entry for each status it can send, spreading `commonErrors`. Undeclared response fields are dropped by serialization.
- Private state uses `#fields`. Timers and errors go through injected `onError` callbacks, which wire to `app.log`.

## Runtime behavior

- Start-up order: `app.listen()` runs **before** `connection.connect()`, then `main.ts` calls `selectBudget(await connection.listBudgets(), ...)` and `connection.load(budget)`. `listBudgets()` needs only `connect()`, not a loaded budget; before that it throws `NotReadyError` (503). `/healthz` returns `503 {status:"starting"}` until the budget has loaded, then `200 {status:"ok", budget, lastSyncAt?, lastSyncError?}`. It stays 200 when syncs fail. Periodic sync starts after the budget loads. `start()` checks an `AbortSignal` between steps. Any start-up failure calls `process.exit(1)`, unless shutdown has already begun.
- Budget selection (`selectBudget`): `ACTUAL_SYNC_ID` wins. Otherwise the bridge matches on `ACTUAL_BUDGET_NAME`. If neither is set, it auto-picks when the server has exactly one budget. Zero or several matches throw an error that lists the available budgets.
- `listBudgets()` keeps only remote files (`state: "remote"`), deduped by `groupId`. `api.getBudgets()` also returns local cache folders, which can be stale.
- Writes: every write route calls a writer, which runs its checks and the library call inside `BudgetWriteQueue.write()`, then `api.sync()`. The periodic sync runs through the same queue. If the sync after a write fails, the write still succeeds (it is in the local copy, the next sync sends it); the error goes to `onSyncError` (logged).
- Shutdown order: abort start-up and await its current step, `await periodicSync.stop()` (waits for a running sync), close the HTTP server (waits for in-flight requests), `await writes.close()` (drains the queue, new writes get 503), then `connection.close()`, which does a final `api.sync()` (only if a budget loaded) and then `api.shutdown()` (if connected). `unhandledRejection`/`uncaughtException` log and run the same shutdown with exit code 1. The whole shutdown is capped at `SHUTDOWN_TIMEOUT_MS` (10s in `main.ts`), after which it exits 1.

Current endpoints: `GET /healthz`, `GET /budgets`, `GET /accounts`, `GET /accounts/:id`, `GET /accounts/:id/balance?cutoff=`, `GET /accounts/:id/transactions?start=&end=`, `GET /categories?hidden=`, `GET /category-groups?hidden=`, `GET /payees`, `GET /budget/months`, `GET /budget/:month`, `POST /accounts/:id/transactions/import`, `POST /accounts/:id/transactions/add`, `GET /id?type=&name=`, and when docs are enabled (`DOCS_ENABLED`, else on only in development), `GET /docs` (Swagger UI) plus `/docs/json` and `/docs/yaml` (spec). `main.ts` reads the spec version from `package.json`.

## Config (env)

| Var | Default | Notes |
|---|---|---|
| `ACTUAL_SERVER_URL` | required | |
| `ACTUAL_PASSWORD` | required | |
| `ACTUAL_SYNC_ID` / `ACTUAL_BUDGET_NAME` | unset | Budget selection, see above |
| `NODE_ENV` | `production` | `development` or `production` only. `@actual-app/api` reads it too (`test` disables its backups, prefs writes and sync scheduling; `development` shows GoCardless demo banks) |
| `HOST` | `127.0.0.1` | Keep the bridge private. It has full write access to the budget |
| `PORT` | `3000` | Integer 1–65535. `.env.example` uses `3001` |
| `DATA_DIR` | `./data` | Local budget cache (gitignored). Created on open |
| `SYNC_INTERVAL_MS` | `60000` | Integer 1000–2147483647. Delay between the end of one sync and the start of the next |
| `DOCS_ENABLED` | `NODE_ENV === "development"` | `true` or `false` only, overrides the environment default. Serves Swagger UI and the spec under `/docs` |

Empty strings count as unset. Invalid values stop start-up with a one-line error. Never commit `.env`.

## Invariants for upcoming work (from the plan)

- **Run a single bridge instance per budget.** The local SQLite copy has a single writer.
- **Serialize writes** through `BudgetWriteQueue` (built), which `sync()`s after each write. New writes (bank sync) go through it too.
- Money is integer minor units (expenses negative). Dates are `YYYY-MM-DD` and months are `YYYY-MM`. Use `utils.amountToInteger` rather than hand-rolled rounding.
- Prefer `importTransactions` (it reconciles, runs rules and dedupes by `imported_id`) over `addTransactions` for user input.
- Account-scoped routes nest under `/accounts/:id/…` (including `…/transactions/import|add`), so `/transactions/:id` always means a transaction id.
- Not built yet: bearer-token auth (`BRIDGE_TOKEN` in an `onRequest` hook, exempting `/healthz`; how `/docs` is handled is an open decision in plan.md), write endpoints and their `body` schemas, end-to-end encrypted budgets (TBD, `downloadBudget` takes `{ password }`).

## Rules

Each rule guards against a bug class found in review. Follow them in every change.

- **Parse env vars only through the `config.ts` helpers.** Never write `Number(x) || default`: it accepts negatives, and it silently turns `NaN` and `0` into the default. Every number gets an explicit integer range. Keep timer delays within 1..2_147_483_647, because Node turns anything outside that range into 1ms.
- **No `setInterval` around async work.** Schedule the next run with `setTimeout` after the previous one settles. Every background task keeps its in-flight promise, and its `stop()` awaits that promise.
- **Shutdown awaits all in-flight work before `connection.close()`.** That covers start-up steps, syncs and, later, writes behind the mutex. Start-up checks the abort signal between steps. Every exit goes through `lifecycle.ts` and stays bounded by the timeout. Don't call `process.exit` anywhere else, except for config and start-up failures in `main.ts`.
- **Never send a raw `err.message` in a 5xx response.** Throw typed errors and let `core/http/error-handler.ts` map them. A capability used before the connection or budget is ready throws `NotReadyError` (503), never a plain `Error`. New error types get a mapping there.
- **Custom error classes set `this.name`.**
- **Wrap every `@actual-app/api` call in `callApi`.** The library rejects with plain objects, not `Error`s, so an unwrapped call reaches Fastify as a non-Error. Known messages map to `NotFoundError`; the rest become `ActualApiError` (500).
- **Check existence where the library fails silently.** An unknown account id gives balance `0` and transactions `[]`, so readers call `AccountReader.get()` first to return 404. Writes store unknown ids without complaint, so writers check every id first: the path target gives `NotFoundError` (404), an id in the body gives `InvalidInputError` (400).
- **Don't spread a TypeBox schema into `Type.Optional`** (`Type.Optional({ ...Day, description })` puts `~optional` into the JSON schema and ajv strict mode fails at boot). Use a factory like `Day(description)`.
- **Log through pino only.** No `console.*`. The one exception is the config error in `main.ts`, before the logger exists. `@actual-app/api` runs with `verbose: false`. Never log config values, passwords or unredacted request headers.
- **Keep docs in sync in the same change.** A new or changed env var, default, endpoint, response shape, error format or roadmap stage updates `.env.example`, README.md, CLAUDE.md and plan.md together. Defaults in `.env.example` and in the docs match the code.
- **`engines.node` must cover every Node flag and API** used in scripts and code (`--env-file-if-exists` needs 22.9).
- **Don't use the non-null `!` to satisfy `noUncheckedIndexedAccess` in `src/`.** Destructure or check instead. `!` is fine in tests.
- **Pure logic lives in side-effect-free functions with a Vitest test next to it.** Examples: selection, parsing, and mapping API results (`toBudgetSummaries`). Anything with timers is tested with fake timers.
- **Check `@actual-app/api` behavior in `node_modules/@actual-app/api/dist/index.js`, not from memory.** Known facts for 26.9.0:
  - `getBudgets()` returns local cache folders (no `state`) plus remote files (`state: "remote"`, deleted files excluded).
  - `shutdown()` syncs but swallows errors.
  - `init()` logs to the console unless you pass `verbose: false`.
  - Errors are plain objects `{ type: "APIError", message, meta }`, e.g. `"Not found: payees with name X"` (`getIDByName`), `"No budget exists for month: …"` (`getBudgetMonth`).
  - `getIDByName(type, name)` is positional. Types: `accounts`, `categories`, `payees`, `schedules`.
  - `getAccountBalance(id, cutoff?: Date)` formats the cutoff in local time; unknown id returns `0`. `getTransactions()` skips empty bounds and returns splits grouped with `subtransactions`; unknown account returns `[]`.
  - `getBudgetMonth()` sheet cells never set come back as `0` (so `carryover` can be `0` instead of `false`).
  - `sync()` rejects with a real `Error` (not an APIError object) when the server sync fails.
  - `importTransactions(accountId, txns, opts)`: passing `opts` replaces the defaults `{ defaultCleared: true, dryRun: false }`. Returns `{ errors, added, updated, updatedPreview }`; `errors` only reports non-integer amounts. An unknown account is not checked.
  - `addTransactions()` resolves `"ok"`, not the new ids, and does not check the account.
