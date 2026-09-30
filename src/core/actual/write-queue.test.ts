import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { ActualApiError, NotReadyError } from "./errors.js";
import { BudgetWriteQueue } from "./write-queue.js";

vi.mock("@actual-app/api", () => ({ sync: vi.fn() }));

const status = fakeStatus();
const onSyncError = vi.fn();
let queue: BudgetWriteQueue;

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
  queue = new BudgetWriteQueue(status, onSyncError);
});

// A promise the test settles by hand.
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("BudgetWriteQueue", () => {
  it("runs a write, then syncs, and returns the write's result", async () => {
    const order: string[] = [];
    vi.mocked(api.sync).mockImplementation(async () => void order.push("sync"));
    const result = await queue.write(async () => {
      order.push("write");
      return 42;
    });
    expect(result).toBe(42);
    expect(order).toEqual(["write", "sync"]);
  });

  it("never overlaps writes and syncs", async () => {
    const first = deferred();
    const order: string[] = [];
    vi.mocked(api.sync).mockImplementation(async () => void order.push("sync"));
    const a = queue.write(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
    });
    const s = queue.sync();
    const b = queue.write(async () => void order.push("b"));
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(["a start"]);
    first.resolve();
    await Promise.all([a, s, b]);
    expect(order).toEqual(["a start", "a end", "sync", "sync", "b", "sync"]);
  });

  it("keeps going after a failed write, and skips its sync", async () => {
    const failed = queue.write(() => Promise.reject(new Error("boom")));
    await expect(failed).rejects.toThrow("boom");
    expect(api.sync).not.toHaveBeenCalled();
    await expect(queue.write(async () => "ok")).resolves.toBe("ok");
  });

  it("translates library error objects from the write", async () => {
    const failed = queue.write(() => Promise.reject({ type: "APIError", message: "No budget file is open" }));
    await expect(failed).rejects.toBeInstanceOf(ActualApiError);
  });

  it("resolves a write whose sync failed and reports the sync error", async () => {
    const err = new Error("network down");
    vi.mocked(api.sync).mockRejectedValue(err);
    await expect(queue.write(async () => "ok")).resolves.toBe("ok");
    expect(onSyncError).toHaveBeenCalledWith(err);
  });

  it("rejects a plain sync failure", async () => {
    vi.mocked(api.sync).mockRejectedValue(new Error("network down"));
    await expect(queue.sync()).rejects.toThrow("network down");
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("throws NotReadyError before the budget loads, without running the work", async () => {
    status.loaded = undefined;
    const fn = vi.fn();
    await expect(queue.write(fn)).rejects.toBeInstanceOf(NotReadyError);
    await expect(queue.sync()).rejects.toBeInstanceOf(NotReadyError);
    expect(fn).not.toHaveBeenCalled();
    expect(api.sync).not.toHaveBeenCalled();
  });

  it("close() waits for queued work and rejects new work", async () => {
    const gate = deferred();
    let done = false;
    const pending = queue.write(async () => {
      await gate.promise;
      done = true;
    });
    let closed = false;
    const closing = queue.close().then(() => (closed = true));
    await expect(queue.write(async () => 1)).rejects.toBeInstanceOf(NotReadyError);
    await expect(queue.sync()).rejects.toBeInstanceOf(NotReadyError);
    expect(closed).toBe(false);
    gate.resolve();
    await closing;
    await pending;
    expect(done).toBe(true);
  });

  it("close() resolves even when queued work failed", async () => {
    const failed = queue.write(() => Promise.reject(new Error("boom")));
    await expect(queue.close()).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow("boom");
  });
});
