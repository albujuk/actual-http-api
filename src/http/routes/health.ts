import type { FastifyPluginAsync } from "fastify";
import type { BudgetStatus } from "../../actual/types.js";
import type { SyncStatus } from "../../sync/periodic-sync.js";

export const healthRoutes =
  (status: BudgetStatus, sync: SyncStatus): FastifyPluginAsync =>
  async (app) => {
    app.get("/healthz", async (_req, reply) => {
      const budget = status.loadedBudget();
      if (!budget) return reply.code(503).send({ status: "starting" });
      // Stays 200 when syncs fail: liveness only. Sync fields are for monitoring.
      const last = sync.lastSync();
      return { status: "ok", budget: budget.name, lastSyncAt: last.at, lastSyncError: last.error };
    });
  };
