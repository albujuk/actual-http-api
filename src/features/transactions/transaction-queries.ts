import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { requireLoaded } from "../../core/actual/guard.js";
import type { BudgetStatus } from "../../core/actual/types.js";
import type { AccountReader } from "../accounts/account-types.js";
import type { DateRange, Transaction, TransactionReader } from "./transaction-types.js";

export class TransactionQueries implements TransactionReader {
  readonly #status: BudgetStatus;
  readonly #accounts: AccountReader;

  constructor(status: BudgetStatus, accounts: AccountReader) {
    this.#status = status;
    this.#accounts = accounts;
  }

  async list(accountId: string, range: DateRange): Promise<Transaction[]> {
    requireLoaded(this.#status);
    // getTransactions returns [] for an unknown account.
    await this.#accounts.get(accountId);
    // The handler skips an empty bound, though the type declares both as strings.
    return callApi(() => api.getTransactions(accountId, range.start ?? "", range.end ?? ""));
  }
}
