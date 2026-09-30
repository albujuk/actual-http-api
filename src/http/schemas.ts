import { Type } from "typebox";

// Cross-cutting TypeBox schemas only. Resource schemas live next to their routes in routes/*.ts.
// Response serialization drops any field a schema doesn't declare.

export const ErrorResponse = Type.Object({ error: Type.String() });

// Every route can fail with these; spread them into each route's `response`.
export const commonErrors = {
  500: { ...ErrorResponse, description: "Internal error. The message is never the raw error" },
};

export const badRequest = {
  400: { ...ErrorResponse, description: "The request failed schema validation" },
};

export const notFound = {
  404: { ...ErrorResponse, description: "The resource does not exist" },
};

export const notReady = {
  503: { ...ErrorResponse, description: "The budget is not loaded yet" },
};

export const Id = Type.String({ minLength: 1, maxLength: 64 });

export const IdParams = Type.Object({ id: Id });

export const Day = (description: string) => Type.String({ format: "date", description: `YYYY-MM-DD. ${description}` });
