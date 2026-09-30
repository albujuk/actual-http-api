import Fastify, { type FastifyInstance } from "fastify";
import { registerDocs } from "./docs.js";
import { errorHandler, notFoundHandler } from "./error-handler.js";
import type { RouteModule } from "./route-module.js";

export type AppOptions = {
  docs: boolean;
  version: string;
};

// Knows no concrete routes: main.ts builds the modules with their dependencies.
export function buildApp(modules: RouteModule[], options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] } });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  if (options.docs) registerDocs(app, options.version, modules.map((m) => m.tag));
  for (const { plugin } of modules) app.register(plugin);
  return app;
}
