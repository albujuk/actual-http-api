import * as api from "@actual-app/api";
import { callApi } from "./api-errors.js";
import { requireLoaded } from "./guard.js";
import type { BudgetStatus, NameResolver, NameType } from "./types.js";

export class ApiNameResolver implements NameResolver {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  // An unknown name rejects with NotFoundError.
  async idByName(type: NameType, name: string): Promise<string> {
    requireLoaded(this.#status);
    return callApi(() => api.getIDByName(type, name));
  }
}
