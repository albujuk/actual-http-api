import type { Category, CategoryGroup } from "../categories/category-types.js";

// Per-month figures. Expense entries carry budgeted/spent/balance/carryover, income entries received.
type MonthFigures = {
  budgeted?: number;
  spent?: number;
  received?: number;
  balance?: number;
  carryover?: boolean;
};

export type BudgetMonthCategory = Category & MonthFigures;

export type BudgetMonthGroup = Omit<CategoryGroup, "categories"> &
  MonthFigures & { categories: BudgetMonthCategory[] };

export type BudgetMonth = {
  month: string;
  incomeAvailable: number;
  lastMonthOverspent: number;
  forNextMonth: number;
  totalBudgeted: number;
  toBudget: number;
  fromLastMonth: number;
  totalIncome: number;
  totalSpent: number;
  totalBalance: number;
  categoryGroups: BudgetMonthGroup[];
};

export interface BudgetMonthReader {
  months(): Promise<string[]>;
  month(month: string): Promise<BudgetMonth>;
}

export interface BudgetAmountWriter {
  // Throws NotFoundError for a month outside the budget, InvalidInputError for an unknown category.
  setAmount(month: string, categoryId: string, amount: number): Promise<void>;
}
