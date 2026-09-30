import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { NotFoundError } from "../../core/actual/errors.js";
import { idRoutes } from "./id-routes.js";

let app: FastifyInstance;

beforeEach(() => {
  app = testApp(
    idRoutes({ idByName: async (_type, name) => (name === "Shop" ? "p1" : Promise.reject(new NotFoundError("not found"))) }),
  );
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("id routes", () => {
  it("resolves a name to an id", async () => {
    const res = await get("/id?type=payees&name=Shop");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "p1" });
    expect((await get("/id?type=payees&name=Other")).statusCode).toBe(404);
  });

  it("rejects an unknown name type or missing name with 400", async () => {
    expect((await get("/id?type=bogus&name=Shop")).statusCode).toBe(400);
    expect((await get("/id?type=payees")).statusCode).toBe(400);
    expect((await get("/id?type=payees&name=")).statusCode).toBe(400);
  });
});
