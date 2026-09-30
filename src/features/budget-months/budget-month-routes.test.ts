import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { month } from "../../../test/support/fixtures.js";
import { InvalidInputError, NotFoundError } from "../../core/actual/errors.js";
import { budgetMonthRoutes } from "./budget-month-routes.js";
import type { BudgetAmountWriter } from "./budget-month-types.js";

let app: FastifyInstance;
const setAmount = vi.fn<BudgetAmountWriter["setAmount"]>();

beforeEach(() => {
  setAmount.mockReset().mockResolvedValue();
  app = testApp(budgetMonthRoutes({ months: async () => ["2026-09"], month: async () => month }, { setAmount }));
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });
const post = (url: string, payload: object) => app.inject({ method: "POST", url, payload });

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

describe("POST /budget/:month/set-amount", () => {
  it("sets the amount and returns ok", async () => {
    const res = await post("/budget/2026-09/set-amount", { categoryId: "c1", amount: 25000 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(setAmount).toHaveBeenCalledWith("2026-09", "c1", 25000);
  });

  it("returns 404 for a month outside the budget", async () => {
    setAmount.mockRejectedValue(new NotFoundError("no budget for that month"));
    const res = await post("/budget/1999-01/set-amount", { categoryId: "c1", amount: 1 });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "no budget for that month" });
  });

  it("returns 400 for an unknown category", async () => {
    setAmount.mockRejectedValue(new InvalidInputError("unknown category: c9"));
    const res = await post("/budget/2026-09/set-amount", { categoryId: "c9", amount: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown category: c9" });
  });

  it.each([
    ["a fractional amount", "2026-09", { categoryId: "c1", amount: 1.5 }],
    ["a missing category", "2026-09", { amount: 1 }],
    ["a bad month", "2026-9", { categoryId: "c1", amount: 1 }],
  ])("rejects %s with 400", async (_name, m, body) => {
    expect((await post(`/budget/${m}/set-amount`, body)).statusCode).toBe(400);
    expect(setAmount).not.toHaveBeenCalled();
  });
});
