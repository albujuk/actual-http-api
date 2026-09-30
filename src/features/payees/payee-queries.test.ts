import { beforeEach, vi } from "vitest";
import * as api from "@actual-app/api";
import { fakeStatus } from "../../../test/support/fixtures.js";
import { describeLibraryCalls } from "../../../test/support/library-calls.js";
import { PayeeQueries } from "./payee-queries.js";

vi.mock("@actual-app/api", () => ({ getPayees: vi.fn() }));

const status = fakeStatus();
const queries = new PayeeQueries(status);

beforeEach(() => {
  vi.resetAllMocks();
  status.loaded = { syncId: "s", name: "Home" };
});

describeLibraryCalls(status, [["PayeeQueries.list", vi.mocked(api.getPayees), () => queries.list()]]);
