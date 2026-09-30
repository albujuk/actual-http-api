import { describe, expect, it } from "vitest";
import { callApi, translateApiError } from "./api-errors.js";
import { ActualApiError, NotFoundError } from "./errors.js";

const apiError = (message: string) => ({ type: "APIError", message });

describe("translateApiError", () => {
  it("maps a failed name lookup to NotFoundError", () => {
    const err = translateApiError(apiError("Not found: payees with name Shop"));
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as Error).message).toBe("not found");
  });

  it("maps a month outside the budget to NotFoundError", () => {
    const err = translateApiError(apiError("No budget exists for month: 1999-01"));
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("maps any other library error to ActualApiError", () => {
    const err = translateApiError(apiError("No budget file is open"));
    expect(err).toBeInstanceOf(ActualApiError);
    expect((err as Error).name).toBe("ActualApiError");
  });

  it("returns other errors unchanged", () => {
    const plain = new Error("boom");
    expect(translateApiError(plain)).toBe(plain);
    expect(translateApiError("text")).toBe("text");
    expect(translateApiError(null)).toBe(null);
    expect(translateApiError({ type: "APIError" })).toEqual({ type: "APIError" });
  });
});

describe("callApi", () => {
  it("passes results through", async () => {
    await expect(callApi(async () => 42)).resolves.toBe(42);
  });

  it("rethrows translated errors", async () => {
    await expect(callApi(() => Promise.reject(apiError("Not found: x")))).rejects.toBeInstanceOf(NotFoundError);
  });
});
