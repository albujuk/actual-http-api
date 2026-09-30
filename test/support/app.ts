import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/core/http/app.js";
import type { RouteModule } from "../../src/core/http/route-module.js";

// An app with only the given modules, no docs and no logs. The caller closes it.
export const testApp = (...modules: RouteModule[]): FastifyInstance =>
  buildApp(modules, { docs: false, version: "0.0.0", logger: false });
