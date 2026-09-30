import { describe, expect, it, type Mock } from "vitest";
import { ActualApiError, NotReadyError } from "../../src/core/actual/errors.js";
import type { FakeStatus } from "./fixtures.js";

// A capability method and the mocked library function whose failure it must translate.
export type LibraryCall = [name: string, library: Mock, call: () => Promise<unknown>];

// Every capability method must check the budget is loaded and wrap its library call in callApi.
export function describeLibraryCalls(status: FakeStatus, calls: LibraryCall[]): void {
  describe.each(calls)("%s", (_name, library, call) => {
    it("throws NotReadyError before the budget loads, without calling the library", async () => {
      status.loaded = undefined;
      await expect(call()).rejects.toBeInstanceOf(NotReadyError);
      expect(library).not.toHaveBeenCalled();
    });

    it("translates a library error object", async () => {
      library.mockRejectedValue({ type: "APIError", message: "No budget file is open" });
      await expect(call()).rejects.toBeInstanceOf(ActualApiError);
    });
  });
}
