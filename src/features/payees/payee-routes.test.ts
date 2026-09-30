import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { payeeRoutes } from "./payee-routes.js";

let app: FastifyInstance;

beforeEach(() => {
  app = testApp(payeeRoutes({ list: async () => [{ id: "p1", name: "Shop", transfer_acct: null }] }));
});

afterEach(async () => {
  await app.close();
});

describe("payee routes", () => {
  it("lists payees", async () => {
    const res = await app.inject({ method: "GET", url: "/payees" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: "p1", name: "Shop", transfer_acct: null }]);
  });
});
