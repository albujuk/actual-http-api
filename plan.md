# actual-api — Technical Plan

Plan for a thin, long-running Node.js HTTP service ("the bridge") that wraps `@actual-app/api` and exposes an Actual Budget budget over HTTP+JSON to any client.

---

## 0. Why this architecture

Actual does **not** expose an HTTP/REST API. The only first-party programmatic interface is the Node.js package `@actual-app/api`, which runs Actual's engine *locally* against a downloaded copy of the budget and syncs changes back to the server. Clients in other languages therefore cannot talk to Actual directly.

Options considered:

| Approach | How | Verdict |
|---|---|---|
| Shell out to `@actual-app/cli` per command | `subprocess` → `actual ... --format json` | Fine for prototyping. But every invocation re-connects and re-loads, so it's slow, and the docs explicitly warn that rapid sequential CLI calls can trigger rate limiting / auth failures. Rejected for clients that fire many small requests. |
| Long-lived Node HTTP bridge (**chosen**) | Fastify wraps `@actual-app/api`, budget stays loaded in memory | Fast (one init, persistent connection), gives full ActualQL access, lets us batch and control sync. One extra process to run — acceptable. Fastify over Express: schema-based validation on every route (catches a malformed payload before it touches the ledger), built-in structured logging (pino), and lower overhead for a service that's mostly small JSON round-trips. |
| Port Actual's logic to another language | Reimplement sync + budget engine | Not viable. The engine is non-trivial and changes upstream. |

**Counter-arguments worth holding in mind:**

- *"A bridge is more moving parts than a hobby project needs."* True. For the occasional write, the CLI is simpler. The bridge earns its keep once there are interactive queries, balances, budgets, and sub-second responses are wanted.
- *"Why HTTP and not a message queue / gRPC?"* HTTP+JSON is the lowest-friction contract, trivially debuggable with `curl`, and every language has a first-class client. A queue buys nothing here because callers need synchronous request/response.

---

## 1. System design

### 1.1 Components and data flow

```
┌──────────────┐   HTTP+JSON   ┌──────────────────┐   sync     ┌────────────────┐
│  HTTP client │ ───────────▶  │  Node.js bridge  │ ─────────▶ │  Actual server │
│  (any lang)  │ ◀───────────  │ (@actual-app/api)│ ◀───────── │  (sync server) │
└──────────────┘   responses   │  budget in memory│  download  └────────────────┘
                               └──────────────────┘
                                        │
                                        └── local dataDir cache (SQLite copy)
```

The bridge is the **only** component that touches Actual. The Actual server is unchanged and unaware the bridge exists — to it, the bridge looks like any other Actual client.

### 1.2 The single-writer constraint (read this twice)

The bridge holds **one** downloaded budget file as a local SQLite database and mutates it in memory, then `sync()`s to the server. Consequences:

- The bridge must be a **single instance**. Do not run two replicas against the same budget — they'd diverge and cause sync conflicts. If horizontal scale is ever needed, writes still go through one bridge.
- Writes must be **serialized** inside the bridge. Wrap mutating operations in an async mutex so two concurrent requests can't interleave a half-finished split transaction with a sync.
- `init` + `downloadBudget` is **expensive and slow** (network + DB load). Do it once at startup, keep it loaded, and expose a `/healthz` that only returns ready *after* init completes.

### 1.3 Amount and date conventions

- **Money is integer minor units** (usually cents). `$120.30` is `12030`; `-$123.50` is `-12350`. Expenses are negative, income positive. Integers go over HTTP in both directions. The API ships `utils.amountToInteger` / `utils.integerToAmount` — use them in the bridge rather than hand-rolled rounding, so currency edge cases match Actual's own behaviour.
- **Dates are `YYYY-MM-DD` strings, months are `YYYY-MM`.** Clients should compute "today" in the user's timezone, not UTC.

### 1.4 Split transactions

A split has a parent (holding the total) and children (the parts). When summing or counting, filter `is_parent: false` to avoid double-counting. Splits are an advanced feature — ship single transactions first.

---

## 2. The bridge service

### 2.1 Lifecycle

1. **Boot** → read config from env, start listening. `/healthz` returns `503` until init finishes.
2. **Init** → `api.init({ dataDir, serverURL, password })`, pick a budget, then `api.downloadBudget(syncId)`. Flip the internal ready state.
3. **Serve** → handle HTTP requests. Reads go straight through; writes go through a mutex and end with `api.sync()`.
4. **Periodic sync** → a timer calls `api.sync()` every N ms so bank-sync / other-device changes are reflected even with no writes.
5. **Shutdown** → on SIGTERM/SIGINT, stop the timer, close the HTTP server, `await api.sync()`, `await api.shutdown()`, then exit. Without this the last write can be lost or the cache corrupted.

### 2.2 Endpoint contract

Keep it small and resource-shaped. All amounts are integer minor units in both directions. Account-scoped reads and writes nest under `/accounts/:id/…`, so `/transactions/:id` always means a transaction id.

| Method | Path | Maps to | Notes |
|---|---|---|---|
| `GET` | `/healthz` | — | `200` only once init done |
| `GET` | `/budgets` | `getBudgets` | lists budgets on the server (built) |
| `GET` | `/docs`, `/docs/json`, `/docs/yaml` | — | Swagger UI + OpenAPI 3.1 spec generated from route schemas, on by default in development, off in production, `DOCS_ENABLED` overrides (built) |
| `GET` | `/accounts` | `getAccounts` | (built) |
| `GET` | `/accounts/:id` | `getAccounts` | `404` for an unknown id (built) |
| `GET` | `/accounts/:id/balance` | `getAccountBalance` | optional `?cutoff=YYYY-MM-DD`, inclusive, parsed as local midnight. `404` for an unknown id (built) |
| `GET` | `/accounts/:id/transactions?start=&end=` | `getTransactions` | inclusive date range, both optional. Splits grouped under `subtransactions`. `404` for an unknown id (built) |
| `POST` | `/accounts/:id/transactions/import` | `importTransactions` | reconciles + runs rules + dedupes |
| `POST` | `/accounts/:id/transactions/add` | `addTransactions` | raw insert, no reconcile |
| `PATCH` | `/transactions/:id` | `updateTransaction` | |
| `DELETE` | `/transactions/:id` | `deleteTransaction` | |
| `GET` | `/categories` | `getCategories` | optional `?hidden=` (built) |
| `GET` | `/category-groups` | `getCategoryGroups` | categories nested, optional `?hidden=` (built) |
| `GET` | `/payees` | `getPayees` | (built) |
| `GET` | `/budget/months` | `getBudgetMonths` | months the budget covers (built) |
| `GET` | `/budget/:month` | `getBudgetMonth` | `YYYY-MM`, `404` outside the budget (built) |
| `POST` | `/budget/:month/set-amount` | `setBudgetAmount` | `{ categoryId, amount }` |
| `POST` | `/query` | `runQuery` + `q(...)` | constrained ActualQL passthrough |
| `POST` | `/bank-sync` | `runBankSync` | optional `{ accountId }` |
| `GET` | `/id?type=&name=` | `getIDByName` | resolve names → ids, `404` if no match (built) |

**`import` vs `add`:** default to `importTransactions` for user input, because it reconciles (dedupes), runs rules (auto-categorization), and creates the other side of transfers. Use `addTransactions` only for bulk raw dumps. An `imported_id` makes imports idempotent — the same id is never added twice.

### 2.3 Prototype: single-file `server.ts`

Reference only. The real code is split by responsibility (see `CLAUDE.md`), but this shows every piece in one place.

```ts
import Fastify from "fastify";
import * as api from "@actual-app/api";

const {
  PORT = "3001",
  BRIDGE_TOKEN,
  ACTUAL_SERVER_URL,
  ACTUAL_PASSWORD,
  ACTUAL_SYNC_ID,
  ACTUAL_E2E_PASSWORD, // only if the file is end-to-end encrypted
  DATA_DIR = "/data",
  SYNC_INTERVAL_MS = "60000",
} = process.env as Record<string, string>;

let ready = false;
let syncTimer: NodeJS.Timeout | undefined;

// Serialize all writes — the budget is a single-writer SQLite copy.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn) as Promise<T>;
  chain = result.catch(() => undefined);
  return result;
}

const app = Fastify({ logger: true });

// ---- auth: shared bearer token on every request ----
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/healthz") return;
  if (req.headers.authorization !== `Bearer ${BRIDGE_TOKEN}`) {
    reply.code(401).send({ error: "unauthorized" });
  }
});

// ---- readiness ----
app.get("/healthz", async (_req, reply) => {
  if (!ready) return reply.code(503).send({ status: "starting" });
  return { status: "ok" };
});

// ---- reads ----
app.get("/accounts", async () => api.getAccounts());

app.get<{ Params: { id: string }; Querystring: { cutoff?: string } }>(
  "/accounts/:id/balance",
  async (req) => {
    const cutoff = req.query.cutoff ? new Date(req.query.cutoff) : undefined;
    return { balance: await api.getAccountBalance(req.params.id, cutoff) };
  },
);

app.get<{ Params: { accountId: string }; Querystring: { start?: string; end?: string } }>(
  "/accounts/:accountId/transactions",
  async (req) => api.getTransactions(req.params.accountId, req.query.start, req.query.end),
);

app.get("/categories", async () => api.getCategories());
app.get("/payees", async () => api.getPayees());
app.get<{ Params: { month: string } }>("/budget/:month", async (req) =>
  api.getBudgetMonth(req.params.month),
);

app.get<{ Querystring: { type: string; name: string } }>("/id", async (req) => ({
  id: await api.getIDByName(req.query.type, req.query.name), // positional, not an object
}));

// ---- writes (locked + synced) ----
app.post<{ Params: { accountId: string }; Body: { transactions: unknown[]; opts?: object } }>(
  "/accounts/:accountId/transactions/import",
  async (req) =>
    withLock(async () => {
      const result = await api.importTransactions(
        req.params.accountId,
        req.body.transactions,
        req.body.opts ?? {},
      );
      await api.sync();
      return result;
    }),
);

app.patch<{ Params: { id: string }; Body: object }>("/transactions/:id", async (req) =>
  withLock(async () => {
    await api.updateTransaction(req.params.id, req.body);
    await api.sync();
    return { ok: true };
  }),
);

app.delete<{ Params: { id: string } }>("/transactions/:id", async (req) =>
  withLock(async () => {
    await api.deleteTransaction(req.params.id);
    await api.sync();
    return { ok: true };
  }),
);

app.post<{ Params: { month: string }; Body: { categoryId: string; amount: number } }>(
  "/budget/:month/set-amount",
  async (req) =>
    withLock(async () => {
      await api.setBudgetAmount(req.params.month, req.body.categoryId, req.body.amount);
      await api.sync();
      return { ok: true };
    }),
);

// ---- constrained ActualQL passthrough ----
const ALLOWED_TABLES = new Set(["transactions", "accounts", "categories", "payees"]);
app.post<{
  Body: { table: string; filter?: object; select?: string; limit?: number; orderBy?: string };
}>("/query", async (req, reply) => {
  const { table, filter = {}, select = "*", limit, orderBy } = req.body;
  if (!ALLOWED_TABLES.has(table)) {
    return reply.code(400).send({ error: "table not allowed" });
  }
  let query = api.q(table).filter(filter).select(select);
  if (orderBy) query = query.orderBy(orderBy);
  if (limit) query = query.limit(limit);
  const { data } = await api.runQuery(query);
  return data;
});

app.post<{ Body: { accountId?: string } }>("/bank-sync", async (req) =>
  withLock(async () => {
    await api.runBankSync(req.body.accountId ? { accountId: req.body.accountId } : undefined);
    await api.sync();
    return { ok: true };
  }),
);

// ---- error handler ----
app.setErrorHandler((err, _req, reply) => {
  reply.code((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message });
});

async function start() {
  await api.init({
    dataDir: DATA_DIR,
    serverURL: ACTUAL_SERVER_URL,
    password: ACTUAL_PASSWORD,
  });
  await api.downloadBudget(
    ACTUAL_SYNC_ID,
    ACTUAL_E2E_PASSWORD ? { password: ACTUAL_E2E_PASSWORD } : undefined,
  );
  ready = true;
  syncTimer = setInterval(() => api.sync().catch((e) => app.log.error(e)), Number(SYNC_INTERVAL_MS));

  await app.listen({ port: Number(PORT), host: "127.0.0.1" });

  // ---- graceful shutdown ----
  const stop = async () => {
    clearInterval(syncTimer);
    await app.close();
    try {
      await api.sync();
    } catch (e) {
      app.log.error(e);
    }
    await api.shutdown();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

start().catch((e) => {
  app.log.error(e, "failed to start bridge");
  process.exit(1);
});
```

> Note: the exact `q(...)` builder method names (`orderBy`, `limit`) follow the ActualQL examples in the docs; confirm against the installed package version, since ActualQL is "mostly undocumented" upstream and surface details shift between releases.
>
> Fastify's `onRequest` hook handles the bearer-token check, and typed route generics (`app.get<{ Params: ...; Querystring: ... }>`) replace manual `req.params`/`req.query` casting. `withLock` returns the handler's result directly (Fastify sends whatever a handler resolves to as the JSON body).

---

## 3. Build stages (roadmap)

| Done | Stage | Goal | Done when |
|---|---|---|---|
| [x] | 0 — Prereqs | Node 22.9+, pnpm, Actual server reachable | `curl` the server, `pnpm add @actual-app/api fastify` |
| [x] | 1 — Skeleton | init + budget selection + downloadBudget + `/healthz` + `/budgets` + periodic sync + graceful shutdown | `/healthz` returns ok after warm-up |
| [x] | 2 — Read endpoints | accounts, balance, transactions, categories, payees, budget month, `/id` | `curl` returns real data |
| [ ] | 3 — Write endpoints | import, add, update, delete, set-amount, with write lock + sync after each write | a posted txn appears in the Actual UI |
| [ ] | 4 — Query + bank sync | constrained `/query`, `/bank-sync` | allowlisted tables only |
| [ ] | 5 — Hardening | bearer-token auth, schema validation on every route (TypeBox schemas feed validation, serialization and the OpenAPI spec; request and response schemas done for existing routes), central error handler (basic version done: `NotReadyError` → 503, `NotFoundError` → 404, validation → 400, library `APIError` objects translated in `core/actual/`, generic 500), no secrets in logs | security checklist met |
| [ ] | 6 — Deploy (TBD) | packaging and restart policy (approach not decided), persistent `DATA_DIR` | survives a reboot |
| [ ] | 7 — Tests + observability | unit tests (budget selection, amounts), smoke test against a throwaway budget, structured logs | green CI (partial: Vitest unit tests for config, budget selection, periodic sync, error translation, dates and budget-month mapping, plus `app.inject` route tests; pino-only logs) |

---

## 4. Deployment

TBD. Packaging (container image or other) is not decided yet. Requirements for whatever is chosen:

- Exactly one bridge instance per budget.
- A supervisor restarts the process on exit, since start-up failures exit non-zero.
- `DATA_DIR` lives on persistent storage, so restarts don't re-download the budget.
- The port stays on a private network, never published to the internet. Only clients on that network reach it, and only with the shared token.
- Clients wait for `GET /healthz` to return `200` before sending requests.

---

## 5. Security

1. **Secrets via env, never in code or git.** Server password, bridge token, E2E password. Keep `.env` out of version control, or use a secrets manager.
2. **The bridge is privileged — isolate it.** It can read and rewrite the entire budget. Bind it to localhost / a private network, never expose its port publicly. Treat it like a database, not a public API.
3. **Authenticate callers.** A shared bearer token (`BRIDGE_TOKEN`, every route except `/healthz`) is the minimum. Across hosts, put it behind TLS (reverse proxy) or mTLS. A token over plaintext on an untrusted network is not enough.
4. **Validate input.** Fastify schemas on every route: strict types, integer amounts, date formats, sane ranges. JSON (not SQL) keeps injection risk low, but garbage should be rejected before it hits the ledger.
5. **TLS to the Actual server.** For self-signed / custom CA certs, prefer `NODE_EXTRA_CA_CERTS`. Avoid `NODE_TLS_REJECT_UNAUTHORIZED=0` except on a fully trusted network — it disables all verification.
6. **Rate limiting.** Consider a limiter on the bridge to protect against floods and Actual's own rate limiting.
7. **Don't log secrets.** Scrub tokens/passwords from logs and error responses.
8. **End-to-end encrypted budgets (TBD, not supported yet).** If enabled, the bridge needs the file password passed to `downloadBudget`; store it as a secret like the rest.
9. **Backups.** The Actual server holds the source of truth; make sure it is backed up.

---

## 6. Things easy to forget

- **Idempotency.** Clients retry. Writes via `importTransactions` should carry an `imported_id` derived from a stable client-side source so retries dedupe. The single most important correctness detail.
- **Write serialization.** Concurrent requests must not interleave against the single-writer budget. The async mutex is mandatory, not decorative.
- **Init is slow; gate readiness.** `/healthz` only flips after `downloadBudget` finishes; clients wait for it.
- **Persist `dataDir`.** Without a volume, every restart re-downloads the whole budget.
- **Crash recovery.** On unhandled start-up error, exit non-zero and let the supervisor restart (which re-inits). Don't limp along with a half-loaded budget.
- **Sync timing.** Sync after every write so other devices see changes, and on a timer so the bridge sees *theirs*. Document the interval.
- **Name resolution.** Callers have names, the API wants ids. `/id` (`getIDByName`) or cached category/payee lists; unknown names return 404 (built).
- **Multi-currency / rounding.** If the budget isn't 2-decimal, `*100` is wrong — use `amountToInteger`.
- **Error responses.** Consistent JSON `{ error }` with correct 4xx/5xx; never leak stack traces or secrets.
- **Observability.** Structured logs, request ids, and a heartbeat so it's obvious the bridge is alive.
- **Testing.** Unit-test pure logic (budget selection, amounts). For integration, point the bridge at a *throwaway* budget, never the real one.
- **Versioning.** `@actual-app/api` and ActualQL change between releases. Pin the version and re-check `q(...)` builder methods on upgrade.

---

## 7. Open decisions

1. **CLI fallback?** Worth keeping `@actual-app/cli` around for ad-hoc admin even with the bridge running.
2. **Multiple budgets?** Currently one budget per instance. Serving several would mean one session per budget and routing by sync id — or simply one instance per budget.
3. **Docs under auth.** A browser can't send a bearer header when it loads Swagger UI. Leaning: exempt `/docs*` from `BRIDGE_TOKEN` (the spec holds no budget data) and declare a `bearerAuth` security scheme so "Try it out" sends the token. In production they are off unless `DOCS_ENABLED=true`.

---

## Appendix — quick reference

- Amounts: integer minor units; expenses negative. `$12.30 → 1230`, `-$5 → -500`.
- Dates: `YYYY-MM-DD`; months `YYYY-MM`; ranges inclusive.
- Use `importTransactions` (reconciles, runs rules, makes transfers) for user input; `addTransactions` only for raw bulk.
- Always pass `imported_id` for dedupe.
- One bridge instance, budget loaded once, writes serialized, sync after writes + on a timer, graceful shutdown.
- Bridge is private and token-authed.
