import type { BudgetMonth, BudgetMonthCategory, BudgetMonthGroup } from "./types.js";

// The subset of api.getBudgetMonth() we read. Sheet cells that were never set come back as 0.
export type RawBudgetMonth = Omit<BudgetMonth, "categoryGroups"> & {
  categoryGroups: Array<Record<string, unknown> & { categories?: Record<string, unknown>[] }>;
};

function withCarryover<T extends Record<string, unknown>>(entry: T): T & { carryover?: boolean } {
  return "carryover" in entry ? { ...entry, carryover: Boolean(entry.carryover) } : entry;
}

export function toBudgetMonth(raw: RawBudgetMonth): BudgetMonth {
  return {
    ...raw,
    categoryGroups: raw.categoryGroups.map(
      (group) =>
        ({
          ...withCarryover(group),
          categories: (group.categories ?? []).map((c) => withCarryover(c) as unknown as BudgetMonthCategory),
        }) as unknown as BudgetMonthGroup,
    ),
  };
}
