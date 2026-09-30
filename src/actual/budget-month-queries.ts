import * as api from "@actual-app/api";
import { callApi } from "./api-errors.js";
import { toBudgetMonth } from "./budget-month.js";
import { requireLoaded } from "./guard.js";
import type { BudgetMonth, BudgetMonthReader, BudgetStatus } from "./types.js";

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
