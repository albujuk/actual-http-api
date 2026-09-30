import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { InvalidInputError, NotFoundError } from "../../core/actual/errors.js";
import type { WriteQueue } from "../../core/actual/types.js";
import type { CategoryReader } from "../categories/category-types.js";
import type { BudgetAmountWriter, BudgetMonthReader } from "./budget-month-types.js";

export class ApiBudgetAmountWriter implements BudgetAmountWriter {
  readonly #queue: WriteQueue;
  readonly #budget: BudgetMonthReader;
  readonly #categories: CategoryReader;

  constructor(queue: WriteQueue, budget: BudgetMonthReader, categories: CategoryReader) {
    this.#queue = queue;
    this.#budget = budget;
    this.#categories = categories;
  }

  // setBudgetAmount checks neither the month nor the category: it stores a row for any pair.
  setAmount(month: string, categoryId: string, amount: number): Promise<void> {
    return this.#queue.write(async () => {
      if (!(await this.#budget.months()).includes(month)) throw new NotFoundError("no budget for that month");
      if (!(await this.#categories.list({})).some((c) => c.id === categoryId)) {
        throw new InvalidInputError(`unknown category: ${categoryId}`);
      }
      await callApi(() => api.setBudgetAmount(month, categoryId, amount));
    });
  }
}
