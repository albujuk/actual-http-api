import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { AccountQueries } from "../src/actual/account-queries.js";
import { ActualApiError, NotFoundError, NotReadyError } from "../src/actual/errors.js";
import type { BudgetStatus, BudgetSummary } from "../src/actual/types.js";

vi.mock("@actual-app/api", () => ({
  getAccounts: vi.fn(),
  getAccountBalance: vi.fn(),
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

type LibraryFn =
  | "getAccounts"
  | "getAccountBalance";

// Every capability method, and the library call whose failure it must translate.
const methods: Array<[name: string, fails: LibraryFn, call: () => Promise<unknown>]> = [
  ["AccountQueries.list", "getAccounts", () => new AccountQueries(status).list()],
  ["AccountQueries.get", "getAccounts", () => new AccountQueries(status).get("a1")],
  ["AccountQueries.balance", "getAccountBalance", () => new AccountQueries(status).balance("a1")],
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

