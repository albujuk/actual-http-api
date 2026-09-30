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

// Budget data as the bridge exposes it. Amounts are integer minor units, dates YYYY-MM-DD.

export type Account = {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  balance_current: number | null;
  account_group_id: string | null;
};

export interface AccountReader {
  list(): Promise<Account[]>;
  // Throws NotFoundError for an unknown id.
  get(id: string): Promise<Account>;
  balance(id: string, cutoff?: Date): Promise<number>;
}
