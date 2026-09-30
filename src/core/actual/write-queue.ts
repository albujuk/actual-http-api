import * as api from "@actual-app/api";
import { callApi } from "./api-errors.js";
import { NotReadyError } from "./errors.js";
import { requireLoaded } from "./guard.js";
import type { BudgetStatus, Syncable, WriteQueue } from "./types.js";

// Everything that changes the local budget copy runs here, one at a time and in order: writes
// (each followed by a sync) and periodic syncs. The local SQLite copy has a single writer.
export class BudgetWriteQueue implements WriteQueue, Syncable {
  readonly #status: BudgetStatus;
  readonly #onSyncError: (err: unknown) => void;
  #tail: Promise<unknown> = Promise.resolve();
  #closed = false;

  constructor(status: BudgetStatus, onSyncError: (err: unknown) => void) {
    this.#status = status;
    this.#onSyncError = onSyncError;
  }

  // The write stands when the sync after it fails: the local copy has it and the next sync
  // sends it. Failing the request would make a client retry a write that already happened.
  write<T>(fn: () => Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const result = await callApi(fn);
      try {
        await callApi(() => api.sync());
      } catch (err) {
        this.#onSyncError(err);
      }
      return result;
    });
  }

  sync(): Promise<void> {
    return this.#enqueue(() => callApi(() => api.sync()));
  }

  // Rejects new work with NotReadyError and resolves once the queued work has settled.
  async close(): Promise<void> {
    this.#closed = true;
    await this.#tail;
  }

  #enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new NotReadyError("shutting down"));
    const run = this.#tail.then(() => {
      requireLoaded(this.#status);
      return fn();
    });
    this.#tail = run.catch(() => undefined);
    return run;
  }
}
