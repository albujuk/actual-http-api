import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { SerialExecutor } from "../sync/serial-executor.js";
import { BudgetSync } from "./budget-sync.js";
import { BudgetWrites } from "./budget-writes.js";
import { ActualApiError, NotReadyError } from "./errors.js";

vi.mock("@actual-app/api", () => ({ sync: vi.fn() }));

const status = fakeStatus();
let lock: SerialExecutor;
let budgetSync: BudgetSync;

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
  lock = new SerialExecutor();
  budgetSync = new BudgetSync(lock, status);
});

// A promise the test settles by hand.
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("BudgetSync", () => {
  it("syncs under the lock", async () => {
    const gate = deferred();
    const held = lock.run(() => gate.promise);
    const syncing = budgetSync.sync();
    await new Promise((r) => setImmediate(r));
    expect(api.sync).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([held, syncing]);
    expect(api.sync).toHaveBeenCalledOnce();
  });

  it("rejects a failed sync", async () => {
    vi.mocked(api.sync).mockRejectedValue(new Error("network down"));
    await expect(budgetSync.sync()).rejects.toThrow("network down");
  });

  it("translates library error objects", async () => {
    vi.mocked(api.sync).mockRejectedValue({ type: "APIError", message: "No budget file is open" });
    await expect(budgetSync.sync()).rejects.toBeInstanceOf(ActualApiError);
  });

  it("throws NotReadyError before the budget loads, without syncing", async () => {
    status.loaded = undefined;
    await expect(budgetSync.sync()).rejects.toBeInstanceOf(NotReadyError);
    expect(api.sync).not.toHaveBeenCalled();
  });

  it("never overlaps a write that shares its lock", async () => {
    const writes = new BudgetWrites(lock, status, () => {});
    const first = deferred();
    const order: string[] = [];
    vi.mocked(api.sync).mockImplementation(async () => void order.push("sync"));
    const a = writes.write(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
    });
    const s = budgetSync.sync();
    const b = writes.write(async () => void order.push("b"));
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(["a start"]);
    first.resolve();
    await Promise.all([a, s, b]);
    expect(order).toEqual(["a start", "a end", "sync", "sync", "b", "sync"]);
  });

  it("rejects new syncs once the lock closes", async () => {
    await lock.close();
    await expect(budgetSync.sync()).rejects.toBeInstanceOf(NotReadyError);
    expect(api.sync).not.toHaveBeenCalled();
  });
});
