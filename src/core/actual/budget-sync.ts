import * as api from "@actual-app/api";
import type { Exclusive } from "../sync/serial-executor.js";
import { callApi } from "./api-errors.js";
import { requireLoaded } from "./guard.js";
import type { BudgetStatus, Syncable } from "./types.js";

// Syncs the loaded budget under the lock the writes share, so a sync never runs mid-write.
export class BudgetSync implements Syncable {
  readonly #lock: Exclusive;
  readonly #status: BudgetStatus;

  constructor(lock: Exclusive, status: BudgetStatus) {
    this.#lock = lock;
    this.#status = status;
  }

  sync(): Promise<void> {
    return this.#lock.run(async () => {
      requireLoaded(this.#status);
      await callApi(() => api.sync());
    });
  }
}
