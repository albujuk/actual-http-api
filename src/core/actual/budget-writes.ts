import * as api from "@actual-app/api";
import type { Exclusive } from "../sync/serial-executor.js";
import { callApi } from "./api-errors.js";
import { requireLoaded } from "./guard.js";
import type { BudgetStatus, WriteQueue } from "./types.js";

// Runs each budget write under the lock, then syncs it to the server.
export class BudgetWrites implements WriteQueue {
  readonly #lock: Exclusive;
  readonly #status: BudgetStatus;
  readonly #onSyncError: (err: unknown) => void;

  constructor(lock: Exclusive, status: BudgetStatus, onSyncError: (err: unknown) => void) {
    this.#lock = lock;
    this.#status = status;
    this.#onSyncError = onSyncError;
  }

  // The write stands when the sync after it fails: the local copy has it and the next sync
  // sends it. Failing the request would make a client retry a write that already happened.
  // Calls api.sync() directly, not BudgetSync, which would take the same lock and deadlock.
  write<T>(fn: () => Promise<T>): Promise<T> {
    return this.#lock.run(async () => {
      requireLoaded(this.#status);
      const result = await callApi(fn);
      try {
        await callApi(() => api.sync());
      } catch (err) {
        this.#onSyncError(err);
      }
      return result;
    });
  }
}
