import { NotReadyError } from "../actual/errors.js";

// Runs a job while no other job holds the same lock. Not reentrant: a job that runs another
// job on the same lock waits for itself and deadlocks.
export interface Exclusive {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

// Runs jobs one at a time, in the order they arrive. A failed job does not block the ones after it.
export class SerialExecutor implements Exclusive {
  #tail: Promise<unknown> = Promise.resolve();
  #closed = false;

  run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new NotReadyError("shutting down"));
    const job = this.#tail.then(() => fn());
    this.#tail = job.catch(() => undefined);
    return job;
  }

  // Rejects new jobs with NotReadyError and resolves once the queued jobs have settled.
  async close(): Promise<void> {
    this.#closed = true;
    await this.#tail;
  }
}
