import type { FastifyPluginAsync } from "fastify";
import type { BudgetCatalog } from "../../actual/types.js";

export const budgetRoutes =
  (catalog: BudgetCatalog): FastifyPluginAsync =>
  async (app) => {
    app.get("/budgets", async () => catalog.listBudgets());
  };
