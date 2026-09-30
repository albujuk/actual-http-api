import * as api from "@actual-app/api";
import { callApi } from "./api-errors.js";
import { NotFoundError } from "./errors.js";
import { requireLoaded } from "./guard.js";
import type { Account, AccountReader, BudgetStatus } from "./types.js";

export class AccountQueries implements AccountReader {
  readonly #status: BudgetStatus;

  constructor(status: BudgetStatus) {
    this.#status = status;
  }

  async list(): Promise<Account[]> {
    requireLoaded(this.#status);
    // The library's model always sets every field, though its type marks them optional.
    return (await callApi(() => api.getAccounts())) as Account[];
  }

  async get(id: string): Promise<Account> {
    const account = (await this.list()).find((a) => a.id === id);
    if (!account) throw new NotFoundError("account not found");
    return account;
  }

  async balance(id: string, cutoff?: Date): Promise<number> {
    // getAccountBalance returns 0 for an unknown id.
    await this.get(id);
    return callApi(() => api.getAccountBalance(id, cutoff));
  }
}
