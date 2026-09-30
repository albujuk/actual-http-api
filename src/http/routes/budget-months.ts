import { Type } from "typebox";
import type { BudgetMonthReader } from "../../actual/types.js";
import type { RouteModule } from "../route-module.js";
import { badRequest, commonErrors, notFound, notReady } from "../schemas.js";

const tag = { name: "budget", description: "Monthly budget figures" };

const Month = Type.String({ pattern: "^\\d{4}-(0[1-9]|1[0-2])$", description: "YYYY-MM" });

// Expense entries carry budgeted, spent, balance and carryover; income entries carry received.
const monthFigures = {
  budgeted: Type.Optional(Type.Integer()),
  spent: Type.Optional(Type.Integer()),
  received: Type.Optional(Type.Integer()),
  balance: Type.Optional(Type.Integer()),
  carryover: Type.Optional(Type.Boolean({ description: "Rolls a negative balance into next month" })),
};

const categoryFields = {
  id: Type.String(),
  name: Type.String(),
  is_income: Type.Boolean(),
  hidden: Type.Boolean(),
};

const BudgetMonth = Type.Object({
  month: Type.String({ description: "YYYY-MM" }),
  incomeAvailable: Type.Integer(),
  lastMonthOverspent: Type.Integer(),
  forNextMonth: Type.Integer(),
  totalBudgeted: Type.Integer(),
  toBudget: Type.Integer(),
  fromLastMonth: Type.Integer(),
  totalIncome: Type.Integer(),
  totalSpent: Type.Integer(),
  totalBalance: Type.Integer(),
  categoryGroups: Type.Array(
    Type.Object({
      ...categoryFields,
      ...monthFigures,
      categories: Type.Array(Type.Object({ ...categoryFields, group_id: Type.String(), ...monthFigures })),
    }),
  ),
});

export const budgetMonthRoutes = (budget: BudgetMonthReader): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/budget/months",
      {
        schema: {
          tags: [tag.name],
          summary: "List the months the budget covers",
          response: { 200: Type.Array(Type.String({ description: "YYYY-MM" })), ...notReady, ...commonErrors },
        },
      },
      async () => budget.months(),
    );

    app.get(
      "/budget/:month",
      {
        schema: {
          tags: [tag.name],
          summary: "Budget figures for one month",
          description: "Amounts are integer minor units.",
          params: Type.Object({ month: Month }),
          response: { 200: BudgetMonth, ...badRequest, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => budget.month(req.params.month),
    );
  },
});
