import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import type { RouteTag } from "./route-module.js";

export const DOCS_PREFIX = "/docs";

// Serves the OpenAPI spec at /docs/json and /docs/yaml and Swagger UI at /docs.
// Register before any route: @fastify/swagger collects routes through an onRoute hook.
export function registerDocs(app: FastifyInstance, version: string, tags: RouteTag[]): void {
  app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Actual Budget HTTP bridge",
        description: "HTTP+JSON bridge for an Actual Budget budget. Errors are JSON `{ error }`.",
        version,
      },
      tags,
    },
  });
  app.register(swaggerUi, { routePrefix: DOCS_PREFIX });
}
