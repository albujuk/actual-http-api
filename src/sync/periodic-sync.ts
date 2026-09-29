import type { Syncable } from "../actual/types.js";

export type LastSync = { at?: string; error?: string };

export interface SyncStatus {
  lastSync(): LastSync;
}

export class PeriodicSync implements SyncStatus {
  readonly #target: Syncable;
  readonly #intervalMs: number;
  readonly #onError: (err: unknown) => void;
  #running = false;
  #timer?: NodeJS.Timeout;
  #inFlight?: Promise<void>;
  #last: LastSync = {};

  constructor(target: Syncable, intervalMs: number, onError: (err: unknown) => void) {
    this.#target = target;
    this.#intervalMs = intervalMs;
    this.#onError = onError;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#schedule();
  }

  // Resolves once no sync is running and none will start.
  async stop(): Promise<void> {
    this.#running = false;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    await this.#inFlight;
  }

  lastSync(): LastSync {
    return { ...this.#last };
  }

  // setTimeout chained after each run, so a slow sync never overlaps the next one.
  #schedule(): void {
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#inFlight = this.#tick();
    }, this.#intervalMs);
  }

  async #tick(): Promise<void> {
    try {
      await this.#target.sync();
      this.#last = { at: new Date().toISOString() };
    } catch (err) {
      this.#last = { ...this.#last, error: err instanceof Error ? err.message : String(err) };
      this.#onError(err);
    } finally {
      this.#inFlight = undefined;
      if (this.#running) this.#schedule();
    }
  }
}
