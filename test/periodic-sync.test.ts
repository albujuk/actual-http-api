import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodicSync } from "../src/sync/periodic-sync.js";

// A sync whose completion the test controls.
function controllableSync() {
  const pending: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  let active = 0;
  let maxActive = 0;
  const target = {
    sync: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          active++;
          maxActive = Math.max(maxActive, active);
          const done = (fn: () => void) => () => {
            active--;
            fn();
          };
          pending.push({ resolve: done(resolve), reject: (err) => done(() => reject(err))() });
        }),
    ),
  };
  return { target, pending, maxActive: () => maxActive };
}

describe("PeriodicSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never overlaps a slow sync", async () => {
    const { target, pending, maxActive } = controllableSync();
    const periodic = new PeriodicSync(target, 1000, () => {});
    periodic.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(target.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(target.sync).toHaveBeenCalledTimes(1);

    pending[0]!.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(target.sync).toHaveBeenCalledTimes(2);
    expect(maxActive()).toBe(1);
    pending[1]!.resolve();
    await periodic.stop();
  });

  it("stop() waits for the in-flight sync and schedules nothing after", async () => {
    const { target, pending } = controllableSync();
    const periodic = new PeriodicSync(target, 1000, () => {});
    periodic.start();
    await vi.advanceTimersByTimeAsync(1000);

    let stopped = false;
    const stopping = periodic.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    pending[0]!.resolve();
    await stopping;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(target.sync).toHaveBeenCalledTimes(1);
  });

  it("records success and failure, and reports errors", async () => {
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const { target, pending } = controllableSync();
    const onError = vi.fn();
    const periodic = new PeriodicSync(target, 1000, onError);
    expect(periodic.lastSync()).toEqual({});
    periodic.start();

    await vi.advanceTimersByTimeAsync(1000);
    pending[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(periodic.lastSync()).toEqual({ at: "2026-09-30T12:00:01.000Z" });

    await vi.advanceTimersByTimeAsync(1000);
    const failure = new Error("server down");
    pending[1]!.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(periodic.lastSync()).toEqual({ at: "2026-09-30T12:00:01.000Z", error: "server down" });

    await periodic.stop();
  });
});
