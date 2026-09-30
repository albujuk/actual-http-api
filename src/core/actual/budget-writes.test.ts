import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { SerialExecutor } from "../sync/serial-executor.js";
import { BudgetWrites } from "./budget-writes.js";
import { ActualApiError, NotReadyError } from "./errors.js";

vi.mock("@actual-app/api", () => ({ sync: vi.fn() }));

const status = fakeStatus();
const onSyncError = vi.fn();
let lock: SerialExecutor;
let writes: BudgetWrites;

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
  lock = new SerialExecutor();
  writes = new BudgetWrites(lock, status, onSyncError);
});

describe("BudgetWrites", () => {
  it("runs a write, then syncs, and returns the write's result", async () => {
    const order: string[] = [];
    vi.mocked(api.sync).mockImplementation(async () => void order.push("sync"));
    const result = await writes.write(async () => {
      order.push("write");
      return 42;
    });
    expect(result).toBe(42);
    expect(order).toEqual(["write", "sync"]);
  });

  it("runs the write and its sync under the lock", async () => {
    const order: string[] = [];
    vi.mocked(api.sync).mockImplementation(async () => void order.push("sync"));
    const a = writes.write(async () => void order.push("a"));
    const other = lock.run(async () => void order.push("other"));
    const b = writes.write(async () => void order.push("b"));
    await Promise.all([a, other, b]);
    expect(order).toEqual(["a", "sync", "other", "b", "sync"]);
  });

  it("skips the sync after a failed write, and keeps going", async () => {
    await expect(writes.write(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(api.sync).not.toHaveBeenCalled();
    await expect(writes.write(async () => "ok")).resolves.toBe("ok");
  });

  it("resolves a write whose sync failed and reports the sync error", async () => {
    const err = new Error("network down");
    vi.mocked(api.sync).mockRejectedValue(err);
    await expect(writes.write(async () => "ok")).resolves.toBe("ok");
    expect(onSyncError).toHaveBeenCalledWith(err);
  });

  it("throws NotReadyError before the budget loads, without running the write", async () => {
    status.loaded = undefined;
    const fn = vi.fn();
    await expect(writes.write(fn)).rejects.toBeInstanceOf(NotReadyError);
    expect(fn).not.toHaveBeenCalled();
    expect(api.sync).not.toHaveBeenCalled();
  });

  it("translates library error objects from the write", async () => {
    const failed = writes.write(() => Promise.reject({ type: "APIError", message: "No budget file is open" }));
    await expect(failed).rejects.toBeInstanceOf(ActualApiError);
  });

  it("rejects new writes once the lock closes", async () => {
    await lock.close();
    const fn = vi.fn();
    await expect(writes.write(fn)).rejects.toBeInstanceOf(NotReadyError);
    expect(fn).not.toHaveBeenCalled();
  });
});
