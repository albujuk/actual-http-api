import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { requireLoaded } from "../../core/actual/guard.js";
import type { BudgetStatus } from "../../core/actual/types.js";
import type { Category, CategoryGroup, CategoryReader, HiddenFilter } from "./category-types.js";

export class CategoryQueries implements CategoryReader {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  async list(filter: HiddenFilter): Promise<Category[]> {
    requireLoaded(this.#status);
    // The library's model always sets every field, though its type marks some optional.
    return (await callApi(() => api.getCategories(filter))) as Category[];
  }

  async groups(filter: HiddenFilter): Promise<CategoryGroup[]> {
    requireLoaded(this.#status);
    return (await callApi(() => api.getCategoryGroups(filter))) as CategoryGroup[];
  }
}
