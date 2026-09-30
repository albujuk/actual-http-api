import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { requireLoaded } from "../../core/actual/guard.js";
import type { BudgetStatus } from "../../core/actual/types.js";
import type { Payee, PayeeReader } from "./payee-types.js";

export class PayeeQueries implements PayeeReader {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  async list(): Promise<Payee[]> {
    requireLoaded(this.#status);
    return callApi(() => api.getPayees());
  }
}
