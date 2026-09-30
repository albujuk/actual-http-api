import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { child, transaction } from "../../../test/support/fixtures.js";
import { NotFoundError } from "../../core/actual/errors.js";
import { transactionRoutes } from "./transaction-routes.js";

let app: FastifyInstance;

beforeEach(() => {
  app = testApp(
    transactionRoutes({
      list: async (id) => (id === "a1" ? [transaction] : Promise.reject(new NotFoundError("account not found"))),
    }),
  );
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });

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
