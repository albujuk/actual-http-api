import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { requireLoaded } from "../../core/actual/guard.js";
import type { BudgetStatus } from "../../core/actual/types.js";
import type { NameResolver, NameType } from "./id-types.js";

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
