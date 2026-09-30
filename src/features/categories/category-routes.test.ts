import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { testApp } from "../../../test/support/app.js";
import { categoryRoutes } from "./category-routes.js";
import type { HiddenFilter } from "./category-types.js";

let app: FastifyInstance;
let categoryFilter: HiddenFilter | undefined;

beforeEach(() => {
  categoryFilter = undefined;
  app = testApp(
    categoryRoutes({
      list: async (filter) => {
        categoryFilter = filter;
        return [];
      },
      groups: async () => [],
    }),
  );
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("category routes", () => {
  it("coerces the hidden filter to a boolean", async () => {
    await get("/categories?hidden=false");
    expect(categoryFilter).toEqual({ hidden: false });
    expect((await get("/categories?hidden=maybe")).statusCode).toBe(400);
  });
});
