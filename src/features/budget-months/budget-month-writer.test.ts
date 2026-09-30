import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus, month } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { InvalidInputError, NotFoundError } from "../../core/actual/errors.js";
import { BudgetWrites } from "../../core/actual/budget-writes.js";
import { SerialExecutor } from "../../core/sync/serial-executor.js";
import type { CategoryReader } from "../categories/category-types.js";
import { ApiBudgetAmountWriter } from "./budget-month-writer.js";

vi.mock("@actual-app/api", () => ({ sync: vi.fn(), setBudgetAmount: vi.fn() }));

const categories: CategoryReader = {
  list: async () => [{ id: "c1", name: "Food", is_income: false, hidden: false, group_id: "g1" }],
  groups: async () => [],
};

const status = fakeStatus();
const writer = new ApiBudgetAmountWriter(
  new BudgetWrites(new SerialExecutor(), status, () => {}),
  { months: async () => ["2026-09"], month: async () => month },
  categories,
);

beforeEach(() => {
  vi.clearAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
});

describe("ApiBudgetAmountWriter", () => {
  it("sets the amount, then syncs", async () => {
    await writer.setAmount("2026-09", "c1", 25000);
    expect(api.setBudgetAmount).toHaveBeenCalledWith("2026-09", "c1", 25000);
    expect(api.sync).toHaveBeenCalledOnce();
  });

  it("rejects a month outside the budget instead of storing a row for it", async () => {
    await expect(writer.setAmount("1999-01", "c1", 1)).rejects.toThrow(new NotFoundError("no budget for that month"));
    expect(api.setBudgetAmount).not.toHaveBeenCalled();
  });

  it("rejects an unknown category instead of storing a row for it", async () => {
    await expect(writer.setAmount("2026-09", "g1", 1)).rejects.toThrow(new InvalidInputError("unknown category: g1"));
    expect(api.setBudgetAmount).not.toHaveBeenCalled();
  });
});

describeLibraryCalls(status, [
  ["ApiBudgetAmountWriter.setAmount", vi.mocked(api.setBudgetAmount), () => writer.setAmount("2026-09", "c1", 1)],
]);
