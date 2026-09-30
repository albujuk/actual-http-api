import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { requireLoaded } from "../../core/actual/guard.js";
import type { BudgetStatus } from "../../core/actual/types.js";
import type { BudgetMonth, BudgetMonthReader } from "./budget-month-types.js";
import { toBudgetMonth } from "./budget-month.js";

export class BudgetMonthQueries implements BudgetMonthReader {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  async months(): Promise<string[]> {
    requireLoaded(this.#status);
    return callApi(() => api.getBudgetMonths());
  }

  // A month outside the budget's range rejects with NotFoundError.
  async month(month: string): Promise<BudgetMonth> {
    requireLoaded(this.#status);
    return toBudgetMonth(await callApi(() => api.getBudgetMonth(month)));
  }
}
