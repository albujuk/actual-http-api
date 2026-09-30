import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { AccountQueries } from "../src/actual/account-queries.js";
import { ActualApiError, NotFoundError, NotReadyError } from "../src/actual/errors.js";
import { ApiNameResolver } from "../src/actual/name-resolver.js";
import { TransactionQueries } from "../src/actual/transaction-queries.js";
import type { BudgetStatus, BudgetSummary } from "../src/actual/types.js";

vi.mock("@actual-app/api", () => ({
  getAccounts: vi.fn(),
  getAccountBalance: vi.fn(),
  getTransactions: vi.fn(),
  getIDByName: vi.fn(),
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

describe("ApiNameResolver", () => {
  it("maps a failed lookup to NotFoundError", async () => {
    vi.mocked(api.getIDByName).mockRejectedValue({ type: "APIError", message: "Not found: payees with name X" });
    await expect(new ApiNameResolver(status).idByName("payees", "X")).rejects.toBeInstanceOf(NotFoundError);
  });
});
