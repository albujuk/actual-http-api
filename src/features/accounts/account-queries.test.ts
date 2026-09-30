import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { account, fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { ActualApiError, NotFoundError, NotReadyError } from "../../core/actual/errors.js";
import { AccountQueries } from "./account-queries.js";

vi.mock("@actual-app/api", () => ({ getAccounts: vi.fn(), getAccountBalance: vi.fn() }));

const status = fakeStatus();
const queries = new AccountQueries(status);

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
  vi.mocked(api.getAccounts).mockResolvedValue([account]);
});

describe("AccountQueries", () => {
  it("throws NotReadyError before the budget loads", async () => {
    status.loaded = undefined;
    await expect(queries.list()).rejects.toBeInstanceOf(NotReadyError);
    expect(api.getAccounts).not.toHaveBeenCalled();
  });

  it("rejects an unknown id instead of returning a zero balance", async () => {
    await expect(queries.balance("nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(api.getAccountBalance).not.toHaveBeenCalled();
  });

  it("passes the cutoff through for a known id", async () => {
    vi.mocked(api.getAccountBalance).mockResolvedValue(1230);
    const cutoff = new Date(2026, 8, 30);
    await expect(queries.balance("a1", cutoff)).resolves.toBe(1230);
    expect(api.getAccountBalance).toHaveBeenCalledWith("a1", cutoff);
  });

  it("translates library error objects", async () => {
    vi.mocked(api.getAccounts).mockRejectedValue({ type: "APIError", message: "No budget file is open" });
    await expect(queries.list()).rejects.toBeInstanceOf(ActualApiError);
  });
});

describeLibraryCalls(status, [
  ["AccountQueries.list", vi.mocked(api.getAccounts), () => queries.list()],
  ["AccountQueries.get", vi.mocked(api.getAccounts), () => queries.get("a1")],
  ["AccountQueries.balance", vi.mocked(api.getAccountBalance), () => queries.balance("a1")],
]);
