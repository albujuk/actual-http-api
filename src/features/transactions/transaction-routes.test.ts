import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { child, transaction } from "../../../test/support/fixtures.js";
import { InvalidInputError, NotFoundError } from "../../core/actual/errors.js";
import { transactionRoutes } from "./transaction-routes.js";
import type { TransactionWriter } from "./transaction-types.js";

let app: FastifyInstance;
let writer: { [K in keyof TransactionWriter]: ReturnType<typeof vi.fn<TransactionWriter[K]>> };

const accountNotFound = () => Promise.reject(new NotFoundError("account not found"));

beforeEach(() => {
  writer = {
    import: vi.fn<TransactionWriter["import"]>(async (id) => (id === "a1" ? { added: ["t9"], updated: [] } : accountNotFound())),
    add: vi.fn<TransactionWriter["add"]>(async (id) => (id === "a1" ? undefined : accountNotFound())),
    update: vi.fn<TransactionWriter["update"]>(async () => {}),
    delete: vi.fn<TransactionWriter["delete"]>(async (id) =>
      id === "t1" ? undefined : Promise.reject(new NotFoundError("transaction not found")),
    ),
  };
  app = testApp(
    transactionRoutes(
      { list: async (id) => (id === "a1" ? [transaction] : accountNotFound()) },
      writer,
    ),
  );
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });
const send = (method: "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

const coffee = { date: "2026-09-30", amount: -450, payee_name: "Cafe", imported_id: "bank-1" };

describe("transaction routes", () => {
  it("serializes transactions without internal fields and keeps split parts", async () => {
    const res = await get("/accounts/a1/transactions?start=2026-09-01&end=2026-09-30");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: "t1", account: "a1", date: "2026-09-02", amount: -500, payee: null, is_parent: true, subtransactions: [child] },
    ]);
  });

  it("returns 404 for transactions of an unknown account", async () => {
    expect((await get("/accounts/nope/transactions")).statusCode).toBe(404);
  });

  it.each(["start=2026-02-30", "end=2026-9-1", "start=yesterday"])("rejects transactions query %j with 400", async (q) => {
    const res = await get(`/accounts/a1/transactions?${q}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/querystring\/(start|end)/);
  });
});

describe("POST /accounts/:id/transactions/import", () => {
  it("imports and returns the added and updated ids", async () => {
    const res = await send("POST", "/accounts/a1/transactions/import", {
      transactions: [coffee],
      opts: { dryRun: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ added: ["t9"], updated: [] });
    expect(writer.import).toHaveBeenCalledWith("a1", [coffee], { dryRun: true });
  });

  it("passes empty options when none are sent", async () => {
    await send("POST", "/accounts/a1/transactions/import", { transactions: [coffee] });
    expect(writer.import).toHaveBeenCalledWith("a1", [coffee], {});
  });

  it("strips fields the schema doesn't declare before they reach the writer", async () => {
    await send("POST", "/accounts/a1/transactions/import", {
      transactions: [{ ...coffee, id: "forced", tombstone: true, subtransactions: [{ amount: -450, x: 1 }] }],
      extra: true,
    });
    expect(writer.import).toHaveBeenCalledWith("a1", [{ ...coffee, subtransactions: [{ amount: -450 }] }], {});
  });

  it("returns 404 for an unknown account", async () => {
    const res = await send("POST", "/accounts/nope/transactions/import", { transactions: [coffee] });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "account not found" });
  });

  it("returns 400 when the writer rejects an unknown reference", async () => {
    writer.import.mockRejectedValue(new InvalidInputError("unknown category: c9"));
    const res = await send("POST", "/accounts/a1/transactions/import", { transactions: [coffee] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown category: c9" });
  });

  it.each([
    ["no transactions", { transactions: [] }],
    ["a missing body", undefined],
    ["a fractional amount", { transactions: [{ ...coffee, amount: -4.5 }] }],
    ["an amount beyond Actual's limit", { transactions: [{ ...coffee, amount: 2 ** 51 }] }],
    ["a missing date", { transactions: [{ amount: -450 }] }],
    ["an invalid date", { transactions: [{ ...coffee, date: "2026-02-30" }] }],
    ["a missing amount", { transactions: [{ date: "2026-09-30" }] }],
    ["an empty split", { transactions: [{ ...coffee, subtransactions: [] }] }],
    ["too many transactions", { transactions: Array.from({ length: 1001 }, () => coffee) }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await send("POST", "/accounts/a1/transactions/import", body);
    expect(res.statusCode).toBe(400);
    expect(writer.import).not.toHaveBeenCalled();
  });
});

describe("POST /accounts/:id/transactions/add", () => {
  it("adds and returns ok", async () => {
    const res = await send("POST", "/accounts/a1/transactions/add", {
      transactions: [coffee],
      opts: { runTransfers: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(writer.add).toHaveBeenCalledWith("a1", [coffee], { runTransfers: true });
  });

  it("returns 404 for an unknown account", async () => {
    expect((await send("POST", "/accounts/nope/transactions/add", { transactions: [coffee] })).statusCode).toBe(404);
  });
});

describe("PATCH /transactions/:id", () => {
  it("passes the patch through, nulls included", async () => {
    const res = await send("PATCH", "/transactions/t1", { amount: -600, category: null, notes: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(writer.update).toHaveBeenCalledWith("t1", { amount: -600, category: null, notes: null });
  });

  it.each([
    ["an empty patch", {}],
    ["only unknown fields", { tombstone: true }],
    ["a bad date", { date: "30/09/2026" }],
    ["a null account", { account: null }],
  ])("rejects %s with 400", async (_name, body) => {
    expect((await send("PATCH", "/transactions/t1", body)).statusCode).toBe(400);
    expect(writer.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /transactions/:id", () => {
  it("deletes and returns ok", async () => {
    const res = await send("DELETE", "/transactions/t1");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("returns 404 for an unknown transaction", async () => {
    const res = await send("DELETE", "/transactions/nope");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "transaction not found" });
  });
});
