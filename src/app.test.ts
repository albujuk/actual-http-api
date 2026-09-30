import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../test/support/app.js";
import { account, budget, month, transaction } from "../test/support/fixtures.js";
import { ActualApiError, NotReadyError } from "./core/actual/errors.js";
import { buildApp } from "./core/http/app.js";
import { accountRoutes } from "./features/accounts/account-routes.js";
import { budgetMonthRoutes } from "./features/budget-months/budget-month-routes.js";
import { budgetRoutes } from "./features/budgets/budget-routes.js";
import { categoryRoutes } from "./features/categories/category-routes.js";
import { healthRoutes } from "./features/health/health-routes.js";
import { idRoutes } from "./features/ids/id-routes.js";
import { payeeRoutes } from "./features/payees/payee-routes.js";
import { transactionRoutes } from "./features/transactions/transaction-routes.js";

// Cross-cutting behavior of the whole app: the docs cover every feature module, and errors
// map the same way for all of them. Per-route behavior lives in each feature's *-routes.test.ts.

let app: FastifyInstance;

// Every feature module, in main.ts order, over fakes.
function build(opts: { docs?: boolean } = {}): FastifyInstance {
  app = buildApp(
    [
      healthRoutes({ loadedBudget: () => undefined }, { lastSync: () => ({}) }),
      budgetRoutes({ listBudgets: async () => [budget] }),
      accountRoutes({ list: async () => [account], get: async () => account, balance: async () => 0 }),
      transactionRoutes({ list: async () => [transaction] }),
      categoryRoutes({ list: async () => [], groups: async () => [] }),
      payeeRoutes({ list: async () => [] }),
      budgetMonthRoutes({ months: async () => ["2026-09"], month: async () => month }),
      idRoutes({ idByName: async () => "p1" }),
    ],
    { docs: opts.docs ?? true, version: "1.2.3", logger: false },
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

describe("error responses", () => {
  const withPayees = (list: () => Promise<never>) => {
    app = testApp(payeeRoutes({ list }));
    return app.inject({ method: "GET", url: "/payees" });
  };

  it("maps NotReadyError to 503", async () => {
    const res = await withPayees(() => Promise.reject(new NotReadyError("no budget loaded")));
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "not ready" });
  });

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
