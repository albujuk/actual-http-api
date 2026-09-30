import { mkdir } from "node:fs/promises";
import * as api from "@actual-app/api";
import { toBudgetSummaries } from "./budget-selection.js";
import { NotReadyError } from "./errors.js";
import type { BudgetCatalog, BudgetLoader, BudgetStatus, BudgetSummary, Connection } from "./types.js";

export type ConnectionOptions = {
  serverUrl: string;
  password: string;
  dataDir: string;
};

export class ActualConnection implements Connection, BudgetCatalog, BudgetLoader, BudgetStatus {
  // @actual-app/api keeps module-level state, so a second instance would share it.
  static #created = false;

  readonly #options: ConnectionOptions;
  #connected = false;
  #loaded?: BudgetSummary;

  constructor(options: ConnectionOptions) {
    if (ActualConnection.#created) throw new Error("only one ActualConnection per process");
    ActualConnection.#created = true;
    this.#options = options;
  }

  async connect(): Promise<void> {
    const { dataDir, serverUrl, password } = this.#options;
    await mkdir(dataDir, { recursive: true });
    // verbose: false keeps the library's console.log output out of the pino stream.
    await api.init({ dataDir, serverURL: serverUrl, password, verbose: false });
    this.#connected = true;
  }

  async listBudgets(): Promise<BudgetSummary[]> {
    this.#requireConnected();
    return toBudgetSummaries(await api.getBudgets());
  }

  async load(budget: BudgetSummary): Promise<void> {
    this.#requireConnected();
    await api.downloadBudget(budget.syncId);
    this.#loaded = budget;
  }

  loadedBudget(): BudgetSummary | undefined {
    return this.#loaded;
  }

  async close(): Promise<void> {
    try {
      // api.shutdown() syncs too, but swallows errors. This sync makes a failed final sync visible.
      if (this.#loaded) await api.sync();
    } finally {
      this.#loaded = undefined;
      if (this.#connected) {
        this.#connected = false;
        await api.shutdown();
      }
    }
  }

  #requireConnected(): void {
    if (!this.#connected) throw new NotReadyError("not connected to the Actual server yet");
  }
}
