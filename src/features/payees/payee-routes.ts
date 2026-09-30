import { Type } from "typebox";
import type { RouteModule } from "../../core/http/route-module.js";
import { commonErrors, notReady } from "../../core/http/schemas.js";
import type { PayeeReader } from "./payee-types.js";

const tag = { name: "payees", description: "Payees" };

const Payee = Type.Object({
  id: Type.String(),
  name: Type.String(),
  transfer_acct: Type.Optional(
    Type.Union([Type.String(), Type.Null()], { description: "Account id when the payee is a transfer target" }),
  ),
});

export const payeeRoutes = (payees: PayeeReader): RouteModule => ({
  tag,
  plugin: async (app) => {
    app.get(
      "/payees",
      {
        schema: {
          tags: [tag.name],
          summary: "List payees",
          response: { 200: Type.Array(Payee), ...notReady, ...commonErrors },
        },
      },
      async () => payees.list(),
    );
  },
});
