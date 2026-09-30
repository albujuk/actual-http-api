import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { AccountQueries } from "../src/actual/account-queries.js";
import { CategoryQueries } from "../src/actual/category-queries.js";
import { ActualApiError, NotFoundError, NotReadyError } from "../src/actual/errors.js";
import { TransactionQueries } from "../src/actual/transaction-queries.js";
import type { BudgetStatus, BudgetSummary } from "../src/actual/types.js";

vi.mock("@actual-app/api", () => ({
  getAccounts: vi.fn(),
  getAccountBalance: vi.fn(),
  getTransactions: vi.fn(),
  getCategories: vi.fn(),
  getCategoryGroups: vi.fn(),
}));

const account = { id: "a1", name: "Checking", offbudget: false, closed: false, balance_current: null, account_group_id: null };

let loaded: BudgetSummary | undefined;
const status: BudgetStatus = { loadedBudget: () => loaded };

beforeEach(() => {
  vi.resetAllMocks();
  loaded = { syncId: "s", name: "Home" };
  vi.mocked(api.getAccounts).mockResolvedValue([account]);
});

describe("AccountQueries", () => {
  it("throws NotReadyError before the budget loads", async () => {
    loaded = undefined;
    await expect(new AccountQueries(status).list()).rejects.toBeInstanceOf(NotReadyError);
    expect(api.getAccounts).not.toHaveBeenCalled();
  });

  it("rejects an unknown id instead of returning a zero balance", async () => {
    await expect(new AccountQueries(status).balance("nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(api.getAccountBalance).not.toHaveBeenCalled();
  });

  it("passes the cutoff through for a known id", async () => {
    vi.mocked(api.getAccountBalance).mockResolvedValue(1230);
    const cutoff = new Date(2026, 8, 30);
    await expect(new AccountQueries(status).balance("a1", cutoff)).resolves.toBe(1230);
    expect(api.getAccountBalance).toHaveBeenCalledWith("a1", cutoff);
  });

  it("translates library error objects", async () => {
    vi.mocked(api.getAccounts).mockRejectedValue({ type: "APIError", message: "No budget file is open" });
    await expect(new AccountQueries(status).list()).rejects.toBeInstanceOf(ActualApiError);
  });
});

describe("TransactionQueries", () => {
  it("rejects an unknown account instead of returning []", async () => {
    const queries = new TransactionQueries(status, new AccountQueries(status));
    await expect(queries.list("nope", {})).rejects.toBeInstanceOf(NotFoundError);
    expect(api.getTransactions).not.toHaveBeenCalled();
  });

  it("sends missing bounds as empty strings, which the library skips", async () => {
    vi.mocked(api.getTransactions).mockResolvedValue([]);
    const queries = new TransactionQueries(status, new AccountQueries(status));
    await queries.list("a1", { start: "2026-09-01" });
    expect(api.getTransactions).toHaveBeenCalledWith("a1", "2026-09-01", "");
  });
});

type LibraryFn =
  | "getAccounts"
  | "getAccountBalance"
  | "getTransactions"
  | "getCategories"
  | "getCategoryGroups";

// Every capability method, and the library call whose failure it must translate.
const methods: Array<[name: string, fails: LibraryFn, call: () => Promise<unknown>]> = [
  ["AccountQueries.list", "getAccounts", () => new AccountQueries(status).list()],
  ["AccountQueries.get", "getAccounts", () => new AccountQueries(status).get("a1")],
  ["AccountQueries.balance", "getAccountBalance", () => new AccountQueries(status).balance("a1")],
  [
    "TransactionQueries.list",
    "getTransactions",
    () => new TransactionQueries(status, new AccountQueries(status)).list("a1", {}),
  ],
  ["CategoryQueries.list", "getCategories", () => new CategoryQueries(status).list({})],
  ["CategoryQueries.groups", "getCategoryGroups", () => new CategoryQueries(status).groups({})],
];

describe.each(methods)("%s", (_name, fails, call) => {
  it("throws NotReadyError before the budget loads, without calling the library", async () => {
    loaded = undefined;
    await expect(call()).rejects.toBeInstanceOf(NotReadyError);
    expect(api[fails]).not.toHaveBeenCalled();
  });

  it("translates a library error object", async () => {
    vi.mocked(api[fails]).mockRejectedValue({ type: "APIError", message: "No budget file is open" });
    await expect(call()).rejects.toBeInstanceOf(ActualApiError);
  });
});

describe("CategoryQueries", () => {
  it("passes the hidden filter through", async () => {
    vi.mocked(api.getCategories).mockResolvedValue([]);
    vi.mocked(api.getCategoryGroups).mockResolvedValue([]);
    const queries = new CategoryQueries(status);
    await queries.list({ hidden: false });
    await queries.groups({ hidden: true });
    expect(api.getCategories).toHaveBeenCalledWith({ hidden: false });
    expect(api.getCategoryGroups).toHaveBeenCalledWith({ hidden: true });
  });
});
