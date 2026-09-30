import { describe, expect, it } from "vitest";
import { toBudgetMonth, type RawBudgetMonth } from "./budget-month.js";

const totals = {
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
};

describe("toBudgetMonth", () => {
  it("turns carryover cells into booleans and leaves entries without one alone", () => {
    const raw: RawBudgetMonth = {
      ...totals,
      categoryGroups: [
        { id: "g1", budgeted: 100, categories: [{ id: "c1", carryover: 0 }, { id: "c2", carryover: true }] },
        { id: "g2", received: 5, categories: [{ id: "c3", received: 5 }] },
        { id: "g3" },
      ],
    };
    const month = toBudgetMonth(raw);
    expect(month.categoryGroups[0]?.categories.map((c) => c.carryover)).toEqual([false, true]);
    expect(month.categoryGroups[1]?.categories[0]).toEqual({ id: "c3", received: 5 });
    expect(month.categoryGroups[2]?.categories).toEqual([]);
    expect(month.totalBudgeted).toBe(0);
  });
});
