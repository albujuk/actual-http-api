import { Type } from "typebox";
import { NAME_TYPES, type NameResolver } from "../../actual/types.js";
import type { RouteModule } from "../route-module.js";
import { badRequest, commonErrors, notFound, notReady } from "../schemas.js";

const tag = { name: "ids", description: "Resolve names to ids" };

export const idRoutes = (resolver: NameResolver): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/id",
      {
        schema: {
          tags: [tag.name],
          summary: "Look up an id by exact name",
          querystring: Type.Object({
            type: Type.Enum(NAME_TYPES),
            name: Type.String({ minLength: 1 }),
          }),
          response: { 200: Type.Object({ id: Type.String() }), ...badRequest, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => ({ id: await resolver.idByName(req.query.type, req.query.name) }),
    );
  },
});
