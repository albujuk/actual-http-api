import * as api from "@actual-app/api";
import { callApi } from "./api-errors.js";
import { requireLoaded } from "./guard.js";
import type { BudgetStatus, Payee, PayeeReader } from "./types.js";

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
