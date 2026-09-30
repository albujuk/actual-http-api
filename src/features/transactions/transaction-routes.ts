import { Type } from "typebox";
import { InvalidInputError } from "../../core/actual/errors.js";
import type { RouteModule } from "../../core/http/route-module.js";
import {
  Amount,
  badRequest,
  commonErrors,
  Day,
  Id,
  IdField,
  IdParams,
  invalidInput,
  notFound,
  notReady,
} from "../../core/http/schemas.js";
import type { TransactionReader, TransactionWriter } from "./transaction-types.js";

const tag = { name: "transactions", description: "Read and write transactions" };

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

const Notes = Type.String({ maxLength: 4096 });

// additionalProperties: false makes Fastify strip unknown fields, so they never reach the library.
const NewSubtransaction = Type.Object(
  {
    amount: Amount("Expenses are negative"),
    category: Type.Optional(Id),
    notes: Type.Optional(Notes),
  },
  { additionalProperties: false },
);

const NewTransaction = Type.Object(
  {
    date: Day("Transaction date"),
    amount: Amount("Expenses are negative. For a split, the total of its parts"),
    payee: Type.Optional(IdField("Existing payee id. Wins over payee_name")),
    payee_name: Type.Optional(
      Type.String({ minLength: 1, maxLength: 255, description: "Matches a payee by name, or creates one" }),
    ),
    imported_payee: Type.Optional(Type.String({ maxLength: 255, description: "Raw payee text from the source" })),
    category: Type.Optional(Id),
    notes: Type.Optional(Notes),
    imported_id: Type.Optional(
      Type.String({ minLength: 1, maxLength: 255, description: "Stable id from the source. Imports skip an id already present" }),
    ),
    cleared: Type.Optional(Type.Boolean()),
    subtransactions: Type.Optional(
      Type.Array(NewSubtransaction, { minItems: 1, maxItems: 100, description: "Makes a split. Parts should sum to amount" }),
    ),
  },
  { additionalProperties: false },
);

const NewTransactions = Type.Array(NewTransaction, { minItems: 1, maxItems: 1000 });

const ImportBody = Type.Object(
  {
    transactions: NewTransactions,
    opts: Type.Optional(
      Type.Object(
        {
          defaultCleared: Type.Optional(Type.Boolean({ description: "cleared for transactions that omit it. Default true" })),
          dryRun: Type.Optional(Type.Boolean({ description: "Report what would change without writing. Default false" })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const ImportResult = Type.Object({
  added: Type.Array(Type.String(), { description: "Ids of new transactions" }),
  updated: Type.Array(Type.String(), { description: "Ids of existing transactions matched and updated" }),
});

const AddBody = Type.Object(
  {
    transactions: NewTransactions,
    opts: Type.Optional(
      Type.Object(
        {
          runTransfers: Type.Optional(Type.Boolean({ description: "Create the other side of transfers. Default false" })),
          learnCategories: Type.Optional(Type.Boolean({ description: "Update category rules from these. Default false" })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

// Null comes first in each union: Fastify coerces types, and would turn null into "" for a string branch.
// minProperties counts fields before unknown ones are stripped, so the handler rejects an empty result.
const TransactionPatch = Type.Object(
  {
    account: Type.Optional(IdField("Moves the transaction to this account")),
    date: Type.Optional(Day("Transaction date")),
    amount: Type.Optional(Amount("Expenses are negative")),
    payee: Type.Optional(Type.Union([Type.Null(), Id], { description: "Payee id, or null to clear" })),
    category: Type.Optional(Type.Union([Type.Null(), Id], { description: "Category id, or null to clear" })),
    notes: Type.Optional(Type.Union([Type.Null(), Notes], { description: "Notes, or null to clear" })),
    cleared: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);

const Ok = Type.Object({ ok: Type.Literal(true) });

export const transactionRoutes = (transactions: TransactionReader, writer: TransactionWriter): RouteModule => ({
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

    app.post(
      "/accounts/:id/transactions/import",
      {
        schema: {
          tags: [tag.name],
          summary: "Import transactions into an account",
          description:
            "Reconciles against existing transactions, runs rules and creates the other side of transfers. " +
            "Send a stable `imported_id` with each transaction so a retried import adds nothing twice.",
          params: IdParams,
          body: ImportBody,
          response: { 200: ImportResult, ...invalidInput, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => writer.import(req.params.id, req.body.transactions, req.body.opts ?? {}),
    );

    app.post(
      "/accounts/:id/transactions/add",
      {
        schema: {
          tags: [tag.name],
          summary: "Add transactions to an account as they are",
          description: "No reconciliation, so a retry adds duplicates. Prefer import for user input.",
          params: IdParams,
          body: AddBody,
          response: { 200: Ok, ...invalidInput, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => {
        await writer.add(req.params.id, req.body.transactions, req.body.opts ?? {});
        return { ok: true as const };
      },
    );

    app.patch(
      "/transactions/:id",
      {
        schema: {
          tags: [tag.name],
          summary: "Update a transaction",
          params: IdParams,
          body: TransactionPatch,
          response: { 200: Ok, ...invalidInput, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => {
        if (Object.keys(req.body).length === 0) throw new InvalidInputError("no known field to update");
        await writer.update(req.params.id, req.body);
        return { ok: true as const };
      },
    );

    app.delete(
      "/transactions/:id",
      {
        schema: {
          tags: [tag.name],
          summary: "Delete a transaction",
          description: "Deleting a split parent deletes its parts.",
          params: IdParams,
          response: { 200: Ok, ...badRequest, ...notFound, ...notReady, ...commonErrors },
        },
      },
      async (req) => {
        await writer.delete(req.params.id);
        return { ok: true as const };
      },
    );
  },
});
