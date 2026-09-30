import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { account, fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { NotFoundError } from "../../core/actual/errors.js";
import type { AccountReader } from "../accounts/account-types.js";
import { TransactionQueries } from "./transaction-queries.js";

vi.mock("@actual-app/api", () => ({ getTransactions: vi.fn() }));

const accounts: AccountReader = {
  list: async () => [account],
  get: async (id) => (id === "a1" ? account : Promise.reject(new NotFoundError("account not found"))),
  balance: async () => 0,
};

const status = fakeStatus();
const queries = new TransactionQueries(status, accounts);

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
});

describe("TransactionQueries", () => {
  it("rejects an unknown account instead of returning []", async () => {
    await expect(queries.list("nope", {})).rejects.toBeInstanceOf(NotFoundError);
    expect(api.getTransactions).not.toHaveBeenCalled();
  });

  it("sends missing bounds as empty strings, which the library skips", async () => {
    vi.mocked(api.getTransactions).mockResolvedValue([]);
    await queries.list("a1", { start: "2026-09-01" });
    expect(api.getTransactions).toHaveBeenCalledWith("a1", "2026-09-01", "");
  });
});

describeLibraryCalls(status, [
  ["TransactionQueries.list", vi.mocked(api.getTransactions), () => queries.list("a1", {})],
]);
