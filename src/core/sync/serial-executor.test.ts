import { describe, expect, it } from "vitest";
import { NotReadyError } from "../actual/errors.js";
import { SerialExecutor } from "./serial-executor.js";

// A promise the test settles by hand.
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const tick = () => new Promise((r) => setImmediate(r));

describe("SerialExecutor", () => {
  it("returns each job's result", async () => {
    await expect(new SerialExecutor().run(async () => 42)).resolves.toBe(42);
  });

  it("runs jobs one at a time, in order", async () => {
    const lock = new SerialExecutor();
    const gates = [deferred(), deferred(), deferred()];
    const order: string[] = [];
    const jobs = gates.map((gate, i) =>
      lock.run(async () => {
        order.push(`${i} start`);
        await gate.promise;
        order.push(`${i} end`);
      }),
    );
    await tick();
    expect(order).toEqual(["0 start"]);
    // Releasing a later job first changes nothing: it has not started.
    gates[2]!.resolve();
    gates[1]!.resolve();
    await tick();
    expect(order).toEqual(["0 start"]);
    gates[0]!.resolve();
    await Promise.all(jobs);
    expect(order).toEqual(["0 start", "0 end", "1 start", "1 end", "2 start", "2 end"]);
  });

  it("keeps going after a failed job", async () => {
    const lock = new SerialExecutor();
    const failed = lock.run(() => Promise.reject(new Error("boom")));
    const next = lock.run(async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });

  it("close() waits for queued jobs and rejects new ones", async () => {
    const lock = new SerialExecutor();
    const gate = deferred();
    const order: string[] = [];
    const first = lock.run(async () => {
      await gate.promise;
      order.push("first");
    });
    const second = lock.run(async () => void order.push("second"));
    let closed = false;
    const closing = lock.close().then(() => (closed = true));
    const late = lock.run(async () => void order.push("late"));
    await expect(late).rejects.toBeInstanceOf(NotReadyError);
    await expect(late).rejects.toThrow("shutting down");
    await tick();
    expect(closed).toBe(false);
    gate.resolve();
    await closing;
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("close() resolves when queued jobs failed", async () => {
    const lock = new SerialExecutor();
    const failed = lock.run(() => Promise.reject(new Error("boom")));
    await expect(lock.close()).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow("boom");
  });
});
