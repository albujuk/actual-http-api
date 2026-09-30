import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { budget } from "../../../test/support/fixtures.js";
import type { BudgetSummary } from "../../core/actual/types.js";
import { budgetRoutes } from "./budget-routes.js";

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

describe("budget routes", () => {
  it("drops fields the response schema doesn't declare", async () => {
    app = testApp(budgetRoutes({ listBudgets: async () => [{ ...budget, extra: "dropped" } as BudgetSummary] }));
    const res = await app.inject({ method: "GET", url: "/budgets" });
    expect(res.json()).toEqual([budget]);
  });
});
