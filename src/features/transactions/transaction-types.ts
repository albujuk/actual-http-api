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
