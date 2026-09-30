import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { budget } from "../../../test/support/fixtures.js";
import type { BudgetSummary } from "../../core/actual/types.js";
import { healthRoutes } from "./health-routes.js";

let app: FastifyInstance;

function healthz(loaded: BudgetSummary | undefined) {
  app = testApp(healthRoutes({ loadedBudget: () => loaded }, { lastSync: () => ({ at: "2026-09-30T12:00:00.000Z" }) }));
  return app.inject({ method: "GET", url: "/healthz" });
}

afterEach(async () => {
  await app.close();
});

describe("health routes", () => {
  it("serializes /healthz before the budget loads", async () => {
    const res = await healthz(undefined);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "starting" });
  });

  it("serializes /healthz once loaded", async () => {
    const res = await healthz(budget);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", budget: "Home", lastSyncAt: "2026-09-30T12:00:00.000Z" });
  });
});
