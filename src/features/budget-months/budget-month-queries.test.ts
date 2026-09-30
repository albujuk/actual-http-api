import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { NotFoundError } from "../../core/actual/errors.js";
import { BudgetMonthQueries } from "./budget-month-queries.js";

vi.mock("@actual-app/api", () => ({ getBudgetMonths: vi.fn(), getBudgetMonth: vi.fn() }));

const status = fakeStatus();
const queries = new BudgetMonthQueries(status);

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
});

describe("BudgetMonthQueries", () => {
  it("normalizes the library's month", async () => {
    vi.mocked(api.getBudgetMonth).mockResolvedValue({
      month: "2026-09",
      incomeAvailable: 0,
      lastMonthOverspent: 0,
      forNextMonth: 0,
      totalBudgeted: 0,
      toBudget: 0,
      fromLastMonth: 0,
      totalIncome: 0,
      totalSpent: 0,
      totalBalance: 0,
      categoryGroups: [{ id: "g1", categories: [{ id: "c1", carryover: 0 }] }],
    });
    const month = await queries.month("2026-09");
    expect(api.getBudgetMonth).toHaveBeenCalledWith("2026-09");
    expect(month.categoryGroups[0]?.categories[0]?.carryover).toBe(false);
  });

  it("maps a month outside the budget to NotFoundError", async () => {
    vi.mocked(api.getBudgetMonth).mockRejectedValue({ type: "APIError", message: "No budget exists for month: 1999-01" });
    await expect(queries.month("1999-01")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describeLibraryCalls(status, [
  ["BudgetMonthQueries.months", vi.mocked(api.getBudgetMonths), () => queries.months()],
  ["BudgetMonthQueries.month", vi.mocked(api.getBudgetMonth), () => queries.month("2026-09")],
]);
