import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ActualApiError, NotFoundError, NotReadyError } from "../src/actual/errors.js";
import type { Account, BudgetSummary, Transaction } from "../src/actual/types.js";
import { buildApp } from "../src/http/app.js";
import { accountRoutes } from "../src/http/routes/accounts.js";
import { budgetRoutes } from "../src/http/routes/budgets.js";
import { categoryRoutes } from "../src/http/routes/categories.js";
import { healthRoutes } from "../src/http/routes/health.js";
import { payeeRoutes } from "../src/http/routes/payees.js";
import { transactionRoutes } from "../src/http/routes/transactions.js";

const budget: BudgetSummary = { syncId: "abc", name: "Home" };

const account: Account = {
  id: "a1",
  name: "Checking",
  offbudget: false,
  closed: false,
  balance_current: null,
  account_group_id: null,
};

const child = { id: "t2", account: "a1", date: "2026-09-02", amount: -500, is_child: true, parent_id: "t1" };
// Internal library fields the response schema must drop.
const internal = { tombstone: false, sort_order: 1, raw_synced_data: "{}", _unmatched: true };
const transaction = {
  id: "t1",
  account: "a1",
  date: "2026-09-02",
  amount: -500,
  payee: null,
  is_parent: true,
  subtransactions: [{ ...child, ...internal }],
  ...internal,
} as Transaction;

const notFound = () => Promise.reject(new NotFoundError("account not found"));

let app: FastifyInstance;
let calls: { balanceCutoff?: Date; categoryFilter?: unknown };

function build(opts: { docs?: boolean; loaded?: BudgetSummary } = {}): FastifyInstance {
  calls = {};
  app = buildApp(
    [
      healthRoutes({ loadedBudget: () => opts.loaded }, { lastSync: () => ({ at: "2026-09-30T12:00:00.000Z" }) }),
      budgetRoutes({ listBudgets: async () => [{ ...budget, extra: "dropped" } as BudgetSummary] }),
      accountRoutes({
        list: async () => [account],
        get: async (id) => (id === "a1" ? account : notFound()),
        balance: async (id, cutoff) => {
          calls.balanceCutoff = cutoff;
          return id === "a1" ? 1230 : notFound();
        },
      }),
      transactionRoutes({ list: async (id) => (id === "a1" ? [transaction] : notFound()) }),
      categoryRoutes({
        list: async (filter) => {
          calls.categoryFilter = filter;
          return [];
        },
        groups: async () => [],
      }),
      payeeRoutes({ list: () => Promise.reject(new NotReadyError("no budget loaded")) }),
    ],
    { docs: opts.docs ?? true, version: "1.2.3" },
  );
  return app;
}

afterEach(async () => {
  await app.close();
});

describe("buildApp docs", () => {
  it("serves an OpenAPI spec covering every route", async () => {
    const res = await build().inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.version).toBe("1.2.3");
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/accounts",
      "/accounts/{id}",
      "/accounts/{id}/balance",
      "/accounts/{id}/transactions",
      "/budgets",
      "/categories",
      "/category-groups",
      "/healthz",
      "/payees",
    ]);
    expect(Object.keys(spec.paths["/healthz"].get.responses)).toEqual(["200", "500", "503"]);
    expect(Object.keys(spec.paths["/accounts/{id}/balance"].get.responses).sort()).toEqual([
      "200",
      "400",
      "404",
      "500",
      "503",
    ]);
    expect(spec.tags.map((t: { name: string }) => t.name)).toEqual([
      "health",
      "budgets",
      "accounts",
      "transactions",
      "categories",
      "payees",
    ]);
  });

  it("serves Swagger UI", async () => {
    const res = await build().inject({ method: "GET", url: "/docs/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });

  it("serves no docs routes when disabled", async () => {
    const res = await build({ docs: false }).inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not found" });
  });
});

describe("route schemas", () => {
  it("serializes /healthz before the budget loads", async () => {
    const res = await build().inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "starting" });
  });

  it("serializes /healthz once loaded", async () => {
    const res = await build({ loaded: budget }).inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", budget: "Home", lastSyncAt: "2026-09-30T12:00:00.000Z" });
  });

  it("drops fields the response schema doesn't declare", async () => {
    const res = await build().inject({ method: "GET", url: "/budgets" });
    expect(res.json()).toEqual([budget]);
  });
});

describe("read routes", () => {
  const get = (url: string) => build().inject({ method: "GET", url });

  it("lists accounts", async () => {
    const res = await get("/accounts");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([account]);
  });

  it("returns 404 for an unknown account", async () => {
    const res = await get("/accounts/nope");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "account not found" });
  });

  it("parses the balance cutoff as local midnight", async () => {
    const res = await get("/accounts/a1/balance?cutoff=2026-09-30");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ balance: 1230 });
    expect(calls.balanceCutoff).toEqual(new Date(2026, 8, 30));
  });

  it("passes no cutoff when omitted", async () => {
    await get("/accounts/a1/balance");
    expect(calls.balanceCutoff).toBeUndefined();
  });

  it.each(["2026-02-30", "2026-9-30", "today"])("rejects cutoff %j with 400", async (cutoff) => {
    const res = await get(`/accounts/a1/balance?cutoff=${cutoff}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("serializes transactions without internal fields and keeps split parts", async () => {
    const res = await get("/accounts/a1/transactions?start=2026-09-01&end=2026-09-30");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: "t1", account: "a1", date: "2026-09-02", amount: -500, payee: null, is_parent: true, subtransactions: [child] },
    ]);
  });

  it("returns 404 for transactions of an unknown account", async () => {
    expect((await get("/accounts/nope/transactions")).statusCode).toBe(404);
  });

  it("coerces the hidden filter to a boolean", async () => {
    await get("/categories?hidden=false");
    expect(calls.categoryFilter).toEqual({ hidden: false });
    expect((await get("/categories?hidden=maybe")).statusCode).toBe(400);
  });

  it("maps NotReadyError to 503", async () => {
    const res = await get("/payees");
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "not ready" });
  });

  it.each(["start=2026-02-30", "end=2026-9-1", "start=yesterday"])("rejects transactions query %j with 400", async (q) => {
    const res = await get(`/accounts/a1/transactions?${q}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/querystring\/(start|end)/);
  });

  it("bounds the id length", async () => {
    expect((await get(`/accounts/${"x".repeat(65)}`)).statusCode).toBe(400);
    expect((await get(`/accounts/${"x".repeat(64)}`)).statusCode).toBe(404);
  });
});

describe("5xx responses", () => {
  const withPayees = (list: () => Promise<never>) => {
    app = buildApp([payeeRoutes({ list })], { docs: false, version: "0.0.0" });
    return app.inject({ method: "GET", url: "/payees" });
  };

  it("never send the message of an unmapped library error", async () => {
    const res = await withPayees(() => Promise.reject(new ActualApiError("secret detail")));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal error" });
  });

  it("never send the message of a plain Error", async () => {
    const res = await withPayees(() => Promise.reject(new Error("secret detail")));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret");
  });

  it("never send the contents of a non-Error rejection", async () => {
    const res = await withPayees(() => Promise.reject({ type: "APIError", message: "secret detail" }));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret");
  });
});
