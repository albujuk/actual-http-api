import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { NotFoundError, NotReadyError } from "../src/actual/errors.js";
import type { Account, BudgetMonth, BudgetSummary, Transaction } from "../src/actual/types.js";
import { buildApp } from "../src/http/app.js";
import { accountRoutes } from "../src/http/routes/accounts.js";
import { budgetMonthRoutes } from "../src/http/routes/budget-months.js";
import { budgetRoutes } from "../src/http/routes/budgets.js";
import { categoryRoutes } from "../src/http/routes/categories.js";
import { healthRoutes } from "../src/http/routes/health.js";
import { idRoutes } from "../src/http/routes/ids.js";
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

const month: BudgetMonth = {
  month: "2026-09",
  incomeAvailable: 1,
  lastMonthOverspent: 0,
  forNextMonth: 0,
  totalBudgeted: -100,
  toBudget: 0,
  fromLastMonth: 0,
  totalIncome: 0,
  totalSpent: -50,
  totalBalance: 50,
  categoryGroups: [
    {
      id: "g1",
      name: "Food",
      is_income: false,
      hidden: false,
      budgeted: 100,
      categories: [
        { id: "c1", name: "Groceries", is_income: false, hidden: false, group_id: "g1", spent: -50, carryover: false },
      ],
    },
  ],
};

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
      budgetMonthRoutes({ months: async () => ["2026-09"], month: async () => month }),
      idRoutes({ idByName: async (_type, name) => (name === "Shop" ? "p1" : Promise.reject(new NotFoundError("not found"))) }),
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
      "/budget/months",
      "/budget/{month}",
      "/budgets",
      "/categories",
      "/category-groups",
      "/healthz",
      "/id",
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
      "budget",
      "ids",
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

  it("lists budget months and serves one month", async () => {
    expect((await get("/budget/months")).json()).toEqual(["2026-09"]);
    const res = await get("/budget/2026-09");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(month);
  });

  it.each(["2026-13", "2026-9", "202609"])("rejects month %j with 400", async (m) => {
    expect((await get(`/budget/${m}`)).statusCode).toBe(400);
  });

  it("resolves a name to an id", async () => {
    const res = await get("/id?type=payees&name=Shop");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "p1" });
    expect((await get("/id?type=payees&name=Other")).statusCode).toBe(404);
  });

  it("rejects an unknown name type or missing name with 400", async () => {
    expect((await get("/id?type=bogus&name=Shop")).statusCode).toBe(400);
    expect((await get("/id?type=payees")).statusCode).toBe(400);
  });
});
