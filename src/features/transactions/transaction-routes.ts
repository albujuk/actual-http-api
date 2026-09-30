import { Type } from "typebox";
import type { RouteModule } from "../../core/http/route-module.js";
import { badRequest, commonErrors, Day, IdParams, notFound, notReady } from "../../core/http/schemas.js";
import type { TransactionReader } from "./transaction-types.js";

const tag = { name: "transactions", description: "Transactions per account" };

const NullableString = Type.Union([Type.String(), Type.Null()]);

const transactionFields = {
  id: Type.String(),
  account: Type.String(),
  date: Type.String({ description: "YYYY-MM-DD" }),
  amount: Type.Integer({ description: "Minor units. Expenses are negative" }),
  payee: Type.Optional(NullableString),
  category: Type.Optional(NullableString),
  notes: Type.Optional(NullableString),
  imported_id: Type.Optional(NullableString),
  imported_payee: Type.Optional(NullableString),
  transfer_id: Type.Optional(NullableString),
  schedule: Type.Optional(NullableString),
  cleared: Type.Optional(Type.Boolean()),
  reconciled: Type.Optional(Type.Boolean()),
  is_parent: Type.Optional(Type.Boolean()),
  is_child: Type.Optional(Type.Boolean()),
  parent_id: Type.Optional(NullableString),
  starting_balance_flag: Type.Optional(Type.Boolean()),
};

const Transaction = Type.Object({
  ...transactionFields,
  subtransactions: Type.Optional(
    Type.Array(Type.Object(transactionFields), { description: "Parts of a split. Sum them or the parent, not both" }),
  ),
});

export const transactionRoutes = (transactions: TransactionReader): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/accounts/:id/transactions",
      {
        schema: {
          tags: [tag.name],
          summary: "List an account's transactions",
          description: "Splits are grouped: a parent carries its parts in `subtransactions`.",
          params: IdParams,
          querystring: Type.Object({
            start: Type.Optional(Day("First day, inclusive")),
            end: Type.Optional(Day("Last day, inclusive")),
          }),
          response: { 200: Type.Array(Transaction), ...badRequest, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => transactions.list(req.params.id, req.query),
    );
  },
});
