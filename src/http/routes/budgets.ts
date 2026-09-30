import { Type } from "typebox";
import type { BudgetCatalog } from "../../actual/types.js";
import type { RouteModule } from "../route-module.js";
import { commonErrors, ErrorResponse } from "../schemas.js";

const tag = { name: "budgets", description: "Budgets on the Actual server" };

const BudgetSummary = Type.Object({
  syncId: Type.String({ description: "Sync id of the budget on the Actual server" }),
  name: Type.String(),
});

export const budgetRoutes = (catalog: BudgetCatalog): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/budgets",
      {
        schema: {
          tags: [tag.name],
          summary: "List budgets on the Actual server",
          response: {
            200: Type.Array(BudgetSummary),
            503: { ...ErrorResponse, description: "Not connected to the Actual server yet" },
            ...commonErrors,
          },
        },
      },
      async () => catalog.listBudgets(),
    );
  },
});
