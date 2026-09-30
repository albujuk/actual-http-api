import { Type } from "typebox";
import type { RouteModule } from "../../core/http/route-module.js";
import { badRequest, commonErrors, notReady } from "../../core/http/schemas.js";
import type { CategoryReader } from "./category-types.js";

const tag = { name: "categories", description: "Categories and category groups" };

const Category = Type.Object({
  id: Type.String(),
  name: Type.String(),
  is_income: Type.Boolean(),
  hidden: Type.Boolean(),
  group_id: Type.String(),
});

const CategoryGroup = Type.Object({
  id: Type.String(),
  name: Type.String(),
  is_income: Type.Boolean(),
  hidden: Type.Boolean(),
  categories: Type.Array(Category),
});

const HiddenQuery = Type.Object({
  hidden: Type.Optional(Type.Boolean({ description: "Only hidden (true) or only visible (false). Omit for all" })),
});

export const categoryRoutes = (categories: CategoryReader): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/categories",
      {
        schema: {
          tags: [tag.name],
          summary: "List categories",
          querystring: HiddenQuery,
          response: { 200: Type.Array(Category), ...badRequest, ...notReady, ...commonErrors },
        },
      },
      async (req) => categories.list(req.query),
    );

    app.get(
      "/category-groups",
      {
        schema: {
          tags: [tag.name],
          summary: "List category groups with their categories",
          querystring: HiddenQuery,
          response: { 200: Type.Array(CategoryGroup), ...badRequest, ...notReady, ...commonErrors },
        },
      },
      async (req) => categories.groups(req.query),
    );
  },
});
