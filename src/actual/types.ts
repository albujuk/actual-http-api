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

export type Transaction = {
  id: string;
  account: string;
  date: string;
  amount: number;
  payee?: string | null;
  category?: string | null;
  notes?: string | null;
  imported_id?: string | null;
  imported_payee?: string | null;
  transfer_id?: string | null;
  schedule?: string | null;
  cleared?: boolean;
  reconciled?: boolean;
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string | null;
  starting_balance_flag?: boolean;
  subtransactions?: Transaction[];
};

export type DateRange = { start?: string; end?: string };

export interface AccountReader {
  list(): Promise<Account[]>;
  // Throws NotFoundError for an unknown id.
  get(id: string): Promise<Account>;
  balance(id: string, cutoff?: Date): Promise<number>;
}

export interface TransactionReader {
  list(accountId: string, range: DateRange): Promise<Transaction[]>;
}
