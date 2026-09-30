import { Type } from "typebox";

// Cross-cutting TypeBox schemas only. Resource schemas live next to their routes in routes/*.ts.
// Response serialization drops any field a schema doesn't declare.

export const ErrorResponse = Type.Object({ error: Type.String() });

// Every route can fail with these; spread them into each route's `response`.
export const commonErrors = {
  500: { ...ErrorResponse, description: "Internal error. The message is never the raw error" },
};
