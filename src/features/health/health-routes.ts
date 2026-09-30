import { Type } from "typebox";
import type { BudgetStatus } from "../../core/actual/types.js";
import type { RouteModule } from "../../core/http/route-module.js";
import { commonErrors } from "../../core/http/schemas.js";
import type { SyncStatus } from "../../core/sync/periodic-sync.js";

const tag = { name: "health", description: "Liveness and sync state" };

const HealthOk = Type.Object({
  status: Type.Literal("ok"),
  budget: Type.String({ description: "Name of the loaded budget" }),
  lastSyncAt: Type.Optional(Type.String({ format: "date-time", description: "End of the last successful sync" })),
  lastSyncError: Type.Optional(Type.String({ description: "Message of the last failed sync" })),
});

const HealthStarting = Type.Object({ status: Type.Literal("starting") });

export const healthRoutes = (status: BudgetStatus, sync: SyncStatus): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/healthz",
      {
        schema: {
          tags: [tag.name],
          summary: "Liveness and budget load state",
          description: "Stays 200 when syncs fail: liveness only. The sync fields are for monitoring.",
          response: {
            200: HealthOk,
            503: { ...HealthStarting, description: "Budget not loaded yet" },
            ...commonErrors,
          },
        },
      },
      async (_req, reply) => {
        const budget = status.loadedBudget();
        if (!budget) return reply.code(503).send({ status: "starting" });
        const last = sync.lastSync();
        return { status: "ok" as const, budget: budget.name, lastSyncAt: last.at, lastSyncError: last.error };
      },
    );
  },
});
