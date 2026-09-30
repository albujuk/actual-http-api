import { Type } from "typebox";

// Cross-cutting TypeBox schemas only. Resource schemas live next to their routes in features/*/*-routes.ts.
// Response serialization drops any field a schema doesn't declare.

export const ErrorResponse = Type.Object({ error: Type.String() });

// Every route can fail with these; spread them into each route's `response`.
export const commonErrors = {
  500: { ...ErrorResponse, description: "Internal error. The message is never the raw error" },
};

export const badRequest = {
  400: { ...ErrorResponse, description: "The request failed schema validation" },
};

// Write routes also answer 400 when the body refers to an id that does not exist.
export const invalidInput = {
  400: { ...ErrorResponse, description: "The request failed schema validation, or refers to an unknown id" },
};

export const notFound = {
  404: { ...ErrorResponse, description: "The resource does not exist" },
};

export const notReady = {
  503: { ...ErrorResponse, description: "The budget is not loaded yet" },
};

const ID_BOUNDS = { minLength: 1, maxLength: 64 };

export const Id = Type.String(ID_BOUNDS);

// An id field with its own description. A factory, since spreading Id into Type.Optional breaks the schema.
export const IdField = (description: string) => Type.String({ ...ID_BOUNDS, description });

export const IdParams = Type.Object({ id: Id });

export const Day = (description: string) => Type.String({ format: "date", description: `YYYY-MM-DD. ${description}` });

// Actual's arithmetic limit for integer amounts (MAX_SAFE_NUMBER in @actual-app/api).
const MAX_AMOUNT = 2 ** 51 - 1;

export const Amount = (description: string) =>
  Type.Integer({ minimum: -MAX_AMOUNT, maximum: MAX_AMOUNT, description: `Minor units. ${description}` });
