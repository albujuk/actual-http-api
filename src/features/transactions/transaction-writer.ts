import * as api from "@actual-app/api";
import { callApi } from "../../core/actual/api-errors.js";
import { ActualApiError, InvalidInputError } from "../../core/actual/errors.js";
import type { WriteQueue } from "../../core/actual/types.js";
import type { AccountReader } from "../accounts/account-types.js";
import type { CategoryReader } from "../categories/category-types.js";
import type { PayeeReader } from "../payees/payee-types.js";
import type {
  AddOptions,
  ImportOptions,
  ImportResult,
  NewTransaction,
  TransactionWriter,
} from "./transaction-types.js";

type Refs = { accounts?: string[]; payees?: string[]; categories?: string[] };

// Every method runs inside the write queue, so its existence checks and the write see the same budget.
// The library stores unknown account, payee and category ids without complaint, so each method
// checks the ids first.
export class ApiTransactionWriter implements TransactionWriter {
  readonly #queue: WriteQueue;
  readonly #accounts: AccountReader;
  readonly #categories: CategoryReader;
  readonly #payees: PayeeReader;

  constructor(queue: WriteQueue, accounts: AccountReader, categories: CategoryReader, payees: PayeeReader) {
    this.#queue = queue;
    this.#accounts = accounts;
    this.#categories = categories;
    this.#payees = payees;
  }

  import(accountId: string, transactions: NewTransaction[], opts: ImportOptions): Promise<ImportResult> {
    return this.#queue.write(async () => {
      await this.#accounts.get(accountId);
      await this.#checkRefs(refsOf(transactions));
      const result = await callApi(() =>
        api.importTransactions(
          accountId,
          transactions.map((t) => ({ ...t, account: accountId })),
          // Passing opts replaces the library's defaults, so both are always set.
          { defaultCleared: opts.defaultCleared ?? true, dryRun: opts.dryRun ?? false },
        ),
      );
      // Only a non-integer amount produces these, which the route schema already rejects.
      if (result.errors.length > 0) throw new ActualApiError(result.errors.map((e) => e.message).join("; "));
      return { added: result.added, updated: result.updated };
    });
  }

  add(accountId: string, transactions: NewTransaction[], opts: AddOptions): Promise<void> {
    return this.#queue.write(async () => {
      await this.#accounts.get(accountId);
      await this.#checkRefs(refsOf(transactions));
      await callApi(() =>
        api.addTransactions(accountId, transactions, {
          runTransfers: opts.runTransfers ?? false,
          learnCategories: opts.learnCategories ?? false,
        }),
      );
    });
  }

  async #checkRefs({ accounts = [], payees = [], categories = [] }: Refs): Promise<void> {
    if (accounts.length > 0) {
      const known = (await this.#accounts.list()).map((a) => a.id);
      rejectUnknown("account", accounts, known);
    }
    if (payees.length > 0) {
      const known = (await this.#payees.list()).map((p) => p.id);
      rejectUnknown("payee", payees, known);
    }
    if (categories.length > 0) {
      const known = (await this.#categories.list({})).map((c) => c.id);
      rejectUnknown("category", categories, known);
    }
  }
}

// The payee and category ids a batch of new transactions refers to, split parts included.
export function refsOf(transactions: NewTransaction[]): Refs {
  return {
    payees: present(transactions.map((t) => t.payee)),
    categories: present(
      transactions.flatMap((t) => [t.category, ...(t.subtransactions ?? []).map((s) => s.category)]),
    ),
  };
}

// Throws InvalidInputError naming the first id that is not among the known ones.
export function rejectUnknown(kind: string, ids: string[], known: string[]): void {
  const knownIds = new Set(known);
  const unknown = ids.find((id) => !knownIds.has(id));
  if (unknown !== undefined) throw new InvalidInputError(`unknown ${kind}: ${unknown}`);
}

function present(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
}
