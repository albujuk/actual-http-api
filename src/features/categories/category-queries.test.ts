import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { CategoryQueries } from "./category-queries.js";

vi.mock("@actual-app/api", () => ({ getCategories: vi.fn(), getCategoryGroups: vi.fn() }));

const status = fakeStatus();
const queries = new CategoryQueries(status);

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
});

describe("CategoryQueries", () => {
  it("passes the hidden filter through", async () => {
    vi.mocked(api.getCategories).mockResolvedValue([]);
    vi.mocked(api.getCategoryGroups).mockResolvedValue([]);
    await queries.list({ hidden: false });
    await queries.groups({ hidden: true });
    expect(api.getCategories).toHaveBeenCalledWith({ hidden: false });
    expect(api.getCategoryGroups).toHaveBeenCalledWith({ hidden: true });
  });
});

describeLibraryCalls(status, [
  ["CategoryQueries.list", vi.mocked(api.getCategories), () => queries.list({})],
  ["CategoryQueries.groups", vi.mocked(api.getCategoryGroups), () => queries.groups({})],
]);
