import { Type } from "typebox";
import { parseDay } from "../../actual/dates.js";
import type { AccountReader } from "../../actual/types.js";
import type { RouteModule } from "../route-module.js";
import { badRequest, commonErrors, Day, IdParams, notFound, notReady } from "../schemas.js";

const tag = { name: "accounts", description: "Accounts and their balances" };

const Account = Type.Object({
  id: Type.String(),
  name: Type.String(),
  offbudget: Type.Boolean(),
  closed: Type.Boolean(),
  balance_current: Type.Union([Type.Integer(), Type.Null()], {
    description: "Balance last reported by bank sync, in minor units",
  }),
  account_group_id: Type.Union([Type.String(), Type.Null()]),
});

const Balance = Type.Object({
  balance: Type.Integer({ description: "Sum of the account's transactions up to the cutoff, in minor units" }),
});

export const accountRoutes = (accounts: AccountReader): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/accounts",
      {
        schema: {
          tags: [tag.name],
          summary: "List accounts",
          response: { 200: Type.Array(Account), ...notReady, ...commonErrors },
        },
      },
      async () => accounts.list(),
    );

    app.get(
      "/accounts/:id",
      {
        schema: {
          tags: [tag.name],
          summary: "Get one account",
          params: IdParams,
          response: { 200: Account, ...badRequest, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => accounts.get(req.params.id),
    );

    app.get(
      "/accounts/:id/balance",
      {
        schema: {
          tags: [tag.name],
          summary: "Account balance",
          params: IdParams,
          querystring: Type.Object({
            cutoff: Type.Optional(Day("Include transactions up to this day. Defaults to today")),
          }),
          response: { 200: Balance, ...badRequest, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => {
        const { cutoff } = req.query;
        return { balance: await accounts.balance(req.params.id, cutoff ? parseDay(cutoff) : undefined) };
      },
    );
  },
});
