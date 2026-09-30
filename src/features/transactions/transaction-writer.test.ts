import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { account, fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { ActualApiError, InvalidInputError, NotFoundError } from "../../core/actual/errors.js";
import { BudgetWrites } from "../../core/actual/budget-writes.js";
import { SerialExecutor } from "../../core/sync/serial-executor.js";
import type { AccountReader } from "../accounts/account-types.js";
import type { CategoryReader } from "../categories/category-types.js";
import type { PayeeReader } from "../payees/payee-types.js";
import { ApiTransactionWriter, refsOf, rejectUnknown } from "./transaction-writer.js";

vi.mock("@actual-app/api", () => {
  // A minimal chainable q() that records its filter.
  const q = vi.fn(() => {
    const query = { filter: vi.fn(() => query), select: vi.fn(() => query), options: vi.fn(() => query) };
    return query;
  });
  return {
    q,
    aqlQuery: vi.fn(),
    sync: vi.fn(),
    importTransactions: vi.fn(),
    addTransactions: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  };
});

const accounts: AccountReader = {
  list: async () => [account],
  get: async (id) => (id === "a1" ? account : Promise.reject(new NotFoundError("account not found"))),
  balance: async () => 0,
};
const categories: CategoryReader = {
  list: async () => [{ id: "c1", name: "Food", is_income: false, hidden: false, group_id: "g1" }],
  groups: async () => [],
};
const payees: PayeeReader = { list: async () => [{ id: "p1", name: "Cafe" }] };

const status = fakeStatus();
const writer = new ApiTransactionWriter(
  new BudgetWrites(new SerialExecutor(), status, () => {}),
  accounts,
  categories,
  payees,
);

const coffee = { date: "2026-09-30", amount: -450, payee: "p1", category: "c1", imported_id: "bank-1" };

beforeEach(() => {
  vi.clearAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
  vi.mocked(api.importTransactions).mockResolvedValue({ errors: [], added: ["t9"], updated: ["t1"], updatedPreview: [] });
  vi.mocked(api.aqlQuery).mockResolvedValue({ data: [{ id: "t1" }] });
});

describe("ApiTransactionWriter.import", () => {
  it("imports with explicit defaults, then syncs", async () => {
    await expect(writer.import("a1", [coffee], {})).resolves.toEqual({ added: ["t9"], updated: ["t1"] });
    expect(api.importTransactions).toHaveBeenCalledWith("a1", [{ ...coffee, account: "a1" }], {
      defaultCleared: true,
      dryRun: false,
    });
    expect(api.sync).toHaveBeenCalledOnce();
  });

  it("passes the options through", async () => {
    await writer.import("a1", [coffee], { defaultCleared: false, dryRun: true });
    expect(api.importTransactions).toHaveBeenCalledWith("a1", expect.anything(), { defaultCleared: false, dryRun: true });
  });

  it("rejects an unknown account without writing", async () => {
    await expect(writer.import("nope", [coffee], {})).rejects.toBeInstanceOf(NotFoundError);
    expect(api.importTransactions).not.toHaveBeenCalled();
  });

  it.each([
    ["payee", { ...coffee, payee: "p9" }],
    ["category", { ...coffee, category: "c9" }],
    ["category", { ...coffee, subtransactions: [{ amount: -450, category: "c9" }] }],
  ])("rejects an unknown %s without writing", async (kind, t) => {
    await expect(writer.import("a1", [t], {})).rejects.toThrow(new InvalidInputError(`unknown ${kind}: ${kind[0]}9`));
    expect(api.importTransactions).not.toHaveBeenCalled();
  });

  it("turns reported import errors into ActualApiError", async () => {
    vi.mocked(api.importTransactions).mockResolvedValue({
      errors: [{ message: "Amount is invalid" }],
      added: [],
      updated: [],
      updatedPreview: [],
    });
    await expect(writer.import("a1", [coffee], {})).rejects.toBeInstanceOf(ActualApiError);
  });
});

describe("ApiTransactionWriter.add", () => {
  it("adds with explicit defaults", async () => {
    await writer.add("a1", [coffee], {});
    expect(api.addTransactions).toHaveBeenCalledWith("a1", [coffee], { runTransfers: false, learnCategories: false });
    expect(api.sync).toHaveBeenCalledOnce();
  });

  it("rejects an unknown account without writing", async () => {
    await expect(writer.add("nope", [coffee], {})).rejects.toBeInstanceOf(NotFoundError);
    expect(api.addTransactions).not.toHaveBeenCalled();
  });
});

describe("ApiTransactionWriter.update", () => {
  it("updates a known transaction", async () => {
    await writer.update("t1", { amount: -600, category: null });
    expect(api.q).toHaveBeenCalledWith("transactions");
    expect(api.updateTransaction).toHaveBeenCalledWith("t1", { amount: -600, category: null });
    expect(api.sync).toHaveBeenCalledOnce();
  });

  it("rejects an unknown transaction instead of doing nothing", async () => {
    vi.mocked(api.aqlQuery).mockResolvedValue({ data: [] });
    await expect(writer.update("nope", { amount: 1 })).rejects.toThrow(new NotFoundError("transaction not found"));
    expect(api.updateTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["account", { account: "a9" }],
    ["payee", { payee: "p9" }],
    ["category", { category: "c9" }],
  ])("rejects an unknown %s", async (kind, patch) => {
    await expect(writer.update("t1", patch)).rejects.toThrow(new InvalidInputError(`unknown ${kind}: ${kind[0]}9`));
    expect(api.updateTransaction).not.toHaveBeenCalled();
  });
});

describe("ApiTransactionWriter.delete", () => {
  it("deletes a known transaction", async () => {
    await writer.delete("t1");
    expect(api.deleteTransaction).toHaveBeenCalledWith("t1");
  });

  it("rejects an unknown transaction", async () => {
    vi.mocked(api.aqlQuery).mockResolvedValue({ data: [] });
    await expect(writer.delete("nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(api.deleteTransaction).not.toHaveBeenCalled();
  });
});

describe("refsOf", () => {
  it("collects distinct payee and category ids, split parts included", () => {
    expect(
      refsOf([
        { date: "2026-09-30", amount: -1, payee: "p1", category: "c1" },
        { date: "2026-09-30", amount: -2, payee: "p1", subtransactions: [{ amount: -2, category: "c2" }, { amount: 0 }] },
        { date: "2026-09-30", amount: -3, payee_name: "New" },
      ]),
    ).toEqual({ payees: ["p1"], categories: ["c1", "c2"] });
  });
});

describe("rejectUnknown", () => {
  it("passes when every id is known", () => {
    expect(() => rejectUnknown("payee", ["p1"], ["p1", "p2"])).not.toThrow();
  });

  it("names the first unknown id", () => {
    expect(() => rejectUnknown("payee", ["p1", "p8", "p9"], ["p1"])).toThrow("unknown payee: p8");
  });
});

describeLibraryCalls(status, [
  ["ApiTransactionWriter.import", vi.mocked(api.importTransactions), () => writer.import("a1", [coffee], {})],
  ["ApiTransactionWriter.add", vi.mocked(api.addTransactions), () => writer.add("a1", [coffee], {})],
  ["ApiTransactionWriter.update", vi.mocked(api.updateTransaction), () => writer.update("t1", { amount: 1 })],
  ["ApiTransactionWriter.delete", vi.mocked(api.deleteTransaction), () => writer.delete("t1")],
]);
