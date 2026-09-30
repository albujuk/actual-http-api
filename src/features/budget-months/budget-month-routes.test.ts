import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { month } from "../../../test/support/fixtures.js";
import { budgetMonthRoutes } from "./budget-month-routes.js";

let app: FastifyInstance;

beforeEach(() => {
  app = testApp(budgetMonthRoutes({ months: async () => ["2026-09"], month: async () => month }));
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("budget month routes", () => {
  it("lists budget months and serves one month", async () => {
    expect((await get("/budget/months")).json()).toEqual(["2026-09"]);
    const res = await get("/budget/2026-09");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(month);
  });

  it.each(["2026-13", "2026-9", "202609"])("rejects month %j with 400", async (m) => {
    expect((await get(`/budget/${m}`)).statusCode).toBe(400);
  });
});
