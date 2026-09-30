// Amounts are integer minor units, dates YYYY-MM-DD.

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

export interface TransactionReader {
  list(accountId: string, range: DateRange): Promise<Transaction[]>;
}

// A transaction to create. `payee` is an existing payee id and wins over `payee_name`, which
// matches or creates a payee by name.
export type NewTransaction = {
  date: string;
  amount: number;
  payee?: string;
  payee_name?: string;
  imported_payee?: string;
  category?: string;
  notes?: string;
  imported_id?: string;
  cleared?: boolean;
  subtransactions?: NewSubtransaction[];
};

export type NewSubtransaction = { amount: number; category?: string; notes?: string };

export type ImportOptions = { defaultCleared?: boolean; dryRun?: boolean };

// Ids of the transactions the import added and of the existing ones it matched and updated.
export type ImportResult = { added: string[]; updated: string[] };

export type AddOptions = { runTransfers?: boolean; learnCategories?: boolean };

// Unknown ids referenced in a body throw InvalidInputError; an unknown target throws NotFoundError.
export interface TransactionWriter {
  import(accountId: string, transactions: NewTransaction[], opts: ImportOptions): Promise<ImportResult>;
  add(accountId: string, transactions: NewTransaction[], opts: AddOptions): Promise<void>;
}
