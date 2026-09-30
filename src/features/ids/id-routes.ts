import { Type } from "typebox";
import type { RouteModule } from "../../core/http/route-module.js";
import { badRequest, commonErrors, notFound, notReady } from "../../core/http/schemas.js";
import { NAME_TYPES, type NameResolver } from "./id-types.js";

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
