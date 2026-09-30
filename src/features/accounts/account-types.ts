// Amounts are integer minor units.

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
