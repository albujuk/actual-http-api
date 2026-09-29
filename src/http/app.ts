import Fastify, { type FastifyInstance } from "fastify";
import type { BudgetCatalog, BudgetStatus } from "../actual/types.js";
import type { SyncStatus } from "../sync/periodic-sync.js";
import { errorHandler, notFoundHandler } from "./error-handler.js";
import { budgetRoutes } from "./routes/budgets.js";
import { healthRoutes } from "./routes/health.js";

export type AppDeps = {
  status: BudgetStatus;
  catalog: BudgetCatalog;
  sync: SyncStatus;
};

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] } });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.register(healthRoutes(deps.status, deps.sync));
  app.register(budgetRoutes(deps.catalog));
  return app;
}
