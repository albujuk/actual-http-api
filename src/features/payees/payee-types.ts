export type Payee = { id: string; name: string; transfer_acct?: string | null };

export interface PayeeReader {
  list(): Promise<Payee[]>;
}
