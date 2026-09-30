import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { account, fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { ActualApiError, InvalidInputError, NotFoundError } from "../../core/actual/errors.js";
import { BudgetWriteQueue } from "../../core/actual/write-queue.js";
import type { AccountReader } from "../accounts/account-types.js";
import type { CategoryReader } from "../categories/category-types.js";
import type { PayeeReader } from "../payees/payee-types.js";
import { ApiTransactionWriter, refsOf, rejectUnknown } from "./transaction-writer.js";

vi.mock("@actual-app/api", () => ({ sync: vi.fn(), importTransactions: vi.fn(), addTransactions: vi.fn() }));

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
const writer = new ApiTransactionWriter(new BudgetWriteQueue(status, () => {}), accounts, categories, payees);

const coffee = { date: "2026-09-30", amount: -450, payee: "p1", category: "c1", imported_id: "bank-1" };

beforeEach(() => {
  vi.clearAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
  vi.mocked(api.importTransactions).mockResolvedValue({ errors: [], added: ["t9"], updated: ["t1"], updatedPreview: [] });
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
]);
