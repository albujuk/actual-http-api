import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

export type RouteTag = { name: string; description: string };

// One resource's routes. Each module owns its schemas and its OpenAPI tag, so adding an
// endpoint never edits app.ts or docs.ts: build the module in main.ts and pass it to buildApp.
export interface RouteModule {
  tag: RouteTag;
  plugin: FastifyPluginAsyncTypebox;
}
