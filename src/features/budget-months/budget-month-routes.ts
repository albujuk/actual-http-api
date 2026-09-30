import { Type } from "typebox";
import type { RouteModule } from "../../core/http/route-module.js";
import { Amount, badRequest, commonErrors, IdField, invalidInput, notFound, notReady } from "../../core/http/schemas.js";
import type { BudgetAmountWriter, BudgetMonthReader } from "./budget-month-types.js";

const tag = { name: "budget", description: "Monthly budget figures and amounts" };

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

const SetAmountBody = Type.Object(
  {
    categoryId: IdField("Category to budget"),
    amount: Amount("The amount budgeted for the month. Replaces the current one"),
  },
  { additionalProperties: false },
);

export const budgetMonthRoutes = (budget: BudgetMonthReader, writer: BudgetAmountWriter): RouteModule => ({
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

    app.post(
      "/budget/:month/set-amount",
      {
        schema: {
          tags: [tag.name],
          summary: "Set the amount budgeted for a category in one month",
          params: Type.Object({ month: Month }),
          body: SetAmountBody,
          response: { 200: Type.Object({ ok: Type.Literal(true) }), ...invalidInput, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => {
        await writer.setAmount(req.params.month, req.body.categoryId, req.body.amount);
        return { ok: true as const };
      },
    );
  },
});
