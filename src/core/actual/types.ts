export type BudgetSummary = { syncId: string; name: string };

export interface BudgetCatalog {
  listBudgets(): Promise<BudgetSummary[]>;
}

export interface BudgetStatus {
  loadedBudget(): BudgetSummary | undefined;
}

export interface Syncable {
  sync(): Promise<void>;
}

export interface Connection {
  connect(): Promise<void>;
  close(): Promise<void>;
}

export interface BudgetLoader {
  load(budget: BudgetSummary): Promise<void>;
}
