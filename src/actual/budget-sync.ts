import * as api from "@actual-app/api";
import { requireLoaded } from "./guard.js";
import type { BudgetStatus, Syncable } from "./types.js";

export class BudgetSync implements Syncable {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  async sync(): Promise<void> {
    requireLoaded(this.#status);
    await api.sync();
  }
}
