import type { BudgetStatus, BudgetSummary } from "../../src/core/actual/types.js";
import type { Account } from "../../src/features/accounts/account-types.js";
import type { BudgetMonth } from "../../src/features/budget-months/budget-month-types.js";
import type { Transaction } from "../../src/features/transactions/transaction-types.js";

export const budget: BudgetSummary = { syncId: "abc", name: "Home" };

export const account: Account = {
  id: "a1",
  name: "Checking",
  offbudget: false,
  closed: false,
  balance_current: null,
  account_group_id: null,
};

export const child = { id: "t2", account: "a1", date: "2026-09-02", amount: -500, is_child: true, parent_id: "t1" };
// Internal library fields the response schema must drop.
const internal = { tombstone: false, sort_order: 1, raw_synced_data: "{}", _unmatched: true };
export const transaction = {
  id: "t1",
  account: "a1",
  date: "2026-09-02",
  amount: -500,
  payee: null,
  is_parent: true,
  subtransactions: [{ ...child, ...internal }],
  ...internal,
} as Transaction;

export const month: BudgetMonth = {
  month: "2026-09",
  incomeAvailable: 1,
  lastMonthOverspent: 0,
  forNextMonth: 0,
  totalBudgeted: -100,
  toBudget: 0,
  fromLastMonth: 0,
  totalIncome: 0,
  totalSpent: -50,
  totalBalance: 50,
  categoryGroups: [
    {
      id: "g1",
      name: "Food",
      is_income: false,
      hidden: false,
      budgeted: 100,
      categories: [
        { id: "c1", name: "Groceries", is_income: false, hidden: false, group_id: "g1", spent: -50, carryover: false },
      ],
    },
    {
      id: "g2",
      name: "Income",
      is_income: true,
      hidden: false,
      received: 2000,
      categories: [{ id: "c2", name: "Salary", is_income: true, hidden: false, group_id: "g2", received: 2000 }],
    },
  ],
};

// A BudgetStatus whose loaded budget a test can change. Starts loaded.
export type FakeStatus = BudgetStatus & { loaded: BudgetSummary | undefined };

export function fakeStatus(): FakeStatus {
  const status: FakeStatus = { loaded: budget, loadedBudget: () => status.loaded };
  return status;
}
