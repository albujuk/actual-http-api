import * as api from "@actual-app/api";
import { NotReadyError } from "./errors.js";
import type { BudgetStatus, Syncable } from "./types.js";

export class BudgetSync implements Syncable {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  async sync(): Promise<void> {
    if (!this.#status.loadedBudget()) throw new NotReadyError("no budget loaded");
    await api.sync();
  }
}
