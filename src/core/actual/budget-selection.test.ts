import { describe, expect, it } from "vitest";
import {
  BudgetSelectionError,
  selectBudget,
  toBudgetSummaries,
} from "./budget-selection.js";

const home = { syncId: "g1", name: "Home" };
const work = { syncId: "g2", name: "Work" };
const home2 = { syncId: "g3", name: "Home" };

describe("selectBudget", () => {
  it("prefers sync id over name", () => {
    expect(selectBudget([home, work], { syncId: "g2", name: "Home" })).toBe(work);
  });

  it("throws on an unknown sync id and lists what exists", () => {
    expect(() => selectBudget([home], { syncId: "nope" })).toThrow(
      /no budget on server with sync id nope\. available: "Home" \(g1\)/,
    );
  });

  it("matches by exact name", () => {
    expect(selectBudget([home, work], { name: "Work" })).toBe(work);
  });

  it("throws when no budget has the name", () => {
    expect(() => selectBudget([home], { name: "Work" })).toThrow(/no budget named "Work"/);
  });

  it("asks for a sync id when several budgets share the name", () => {
    expect(() => selectBudget([home, home2], { name: "Home" })).toThrow(
      /multiple budgets named "Home"; specify a sync id/,
    );
  });

  it("auto-picks the only budget", () => {
    expect(selectBudget([home], {})).toBe(home);
  });

  it("throws when there are several budgets and no criteria", () => {
    expect(() => selectBudget([home, work], {})).toThrow(/multiple budgets on server/);
  });

  it("throws a named BudgetSelectionError when there are none", () => {
    const err = (() => {
      try {
        selectBudget([], {});
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(BudgetSelectionError);
    expect(err).toMatchObject({ name: "BudgetSelectionError", message: "no budgets on server. available: none" });
  });
});

describe("toBudgetSummaries", () => {
  it("keeps remote files only, deduped by groupId", () => {
    const summaries = toBudgetSummaries([
      { groupId: "g1", name: "Home (local)" },
      { groupId: "stale", name: "Deleted on server" },
      { groupId: "g1", name: "Home", state: "remote" },
      { groupId: "g1", name: "Home", state: "remote" },
      { name: "No group", state: "remote" },
      { groupId: "g2", name: "Work", state: "remote" },
    ]);
    expect(summaries).toEqual([home, work]);
  });
});
