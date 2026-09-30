import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { BudgetSummary } from "../src/actual/types.js";
import { buildApp } from "../src/http/app.js";
import { budgetRoutes } from "../src/http/routes/budgets.js";
import { healthRoutes } from "../src/http/routes/health.js";

const budget: BudgetSummary = { syncId: "abc", name: "Home" };

let app: FastifyInstance;

function build(opts: { docs?: boolean; loaded?: BudgetSummary } = {}): FastifyInstance {
  app = buildApp(
    [
      healthRoutes({ loadedBudget: () => opts.loaded }, { lastSync: () => ({ at: "2026-09-30T12:00:00.000Z" }) }),
      budgetRoutes({ listBudgets: async () => [{ ...budget, extra: "dropped" } as BudgetSummary] }),
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
    expect(Object.keys(spec.paths).sort()).toEqual(["/budgets", "/healthz"]);
    expect(Object.keys(spec.paths["/healthz"].get.responses)).toEqual(["200", "500", "503"]);
    expect(spec.tags.map((t: { name: string }) => t.name)).toEqual(["health", "budgets"]);
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
