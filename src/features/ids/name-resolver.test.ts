import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { NotFoundError } from "../../core/actual/errors.js";
import { ApiNameResolver } from "./name-resolver.js";

vi.mock("@actual-app/api", () => ({ getIDByName: vi.fn() }));

const status = fakeStatus();
const resolver = new ApiNameResolver(status);

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
});

describe("ApiNameResolver", () => {
  it("maps a failed lookup to NotFoundError", async () => {
    vi.mocked(api.getIDByName).mockRejectedValue({ type: "APIError", message: "Not found: payees with name X" });
    await expect(resolver.idByName("payees", "X")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describeLibraryCalls(status, [
  ["ApiNameResolver.idByName", vi.mocked(api.getIDByName), () => resolver.idByName("payees", "X")],
]);
