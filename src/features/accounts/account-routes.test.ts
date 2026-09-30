import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { account } from "../../../test/support/fixtures.js";
import { NotFoundError } from "../../core/actual/errors.js";
import { accountRoutes } from "./account-routes.js";

const notFound = () => Promise.reject(new NotFoundError("account not found"));

let app: FastifyInstance;
let balanceCutoff: Date | undefined;

beforeEach(() => {
  balanceCutoff = undefined;
  app = testApp(
    accountRoutes({
      list: async () => [account],
      get: async (id) => (id === "a1" ? account : notFound()),
      balance: async (id, cutoff) => {
        balanceCutoff = cutoff;
        return id === "a1" ? 1230 : notFound();
      },
    }),
  );
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("account routes", () => {
  it("lists accounts", async () => {
    const res = await get("/accounts");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([account]);
  });

  it("returns 404 for an unknown account", async () => {
    const res = await get("/accounts/nope");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "account not found" });
  });

  it("parses the balance cutoff as local midnight", async () => {
    const res = await get("/accounts/a1/balance?cutoff=2026-09-30");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ balance: 1230 });
    expect(balanceCutoff).toEqual(new Date(2026, 8, 30));
  });

  it("passes no cutoff when omitted", async () => {
    await get("/accounts/a1/balance");
    expect(balanceCutoff).toBeUndefined();
  });

  it.each(["2026-02-30", "2026-9-30", "today"])("rejects cutoff %j with 400", async (cutoff) => {
    const res = await get(`/accounts/a1/balance?cutoff=${cutoff}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("bounds the id length", async () => {
    expect((await get(`/accounts/${"x".repeat(65)}`)).statusCode).toBe(400);
    expect((await get(`/accounts/${"x".repeat(64)}`)).statusCode).toBe(404);
  });
});
