import { ActualApiError, NotFoundError } from "./errors.js";

// @actual-app/api rejects with plain objects { type: "APIError", message }, not Error instances.
type ApiErrorObject = { type: "APIError"; message: string };

function isApiErrorObject(err: unknown): err is ApiErrorObject {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: unknown }).type === "APIError" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

// Maps library errors to typed bridge errors. Anything else is returned unchanged.
export function translateApiError(err: unknown): unknown {
  if (!isApiErrorObject(err)) return err;
  if (err.message.startsWith("Not found:")) return new NotFoundError("not found");
  if (err.message.startsWith("No budget exists for month")) return new NotFoundError("no budget for that month");
  return new ActualApiError(err.message);
}

export async function callApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw translateApiError(err);
  }
}
