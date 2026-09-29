import type { BudgetSummary } from "./types.js";

export type BudgetCriteria = { syncId?: string; name?: string };

// The subset of api.getBudgets() entries we read.
export type BudgetFile = { groupId?: string; name: string; state?: string };

export class BudgetSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetSelectionError";
  }
}

// getBudgets lists local cache folders (no state) and remote files (state "remote"), often
// under the same groupId. Only remote files are real budgets on this server.
export function toBudgetSummaries(files: BudgetFile[]): BudgetSummary[] {
  const unique = new Map<string, BudgetSummary>();
  for (const f of files) {
    if (f.state === "remote" && f.groupId) unique.set(f.groupId, { syncId: f.groupId, name: f.name });
  }
  return [...unique.values()];
}

export function selectBudget(budgets: BudgetSummary[], criteria: BudgetCriteria): BudgetSummary {
  const available = budgets.map((b) => `"${b.name}" (${b.syncId})`).join(", ") || "none";

  if (criteria.syncId) {
    const match = budgets.find((b) => b.syncId === criteria.syncId);
    if (!match) {
      throw new BudgetSelectionError(
        `no budget on server with sync id ${criteria.syncId}. available: ${available}`,
      );
    }
    return match;
  }

  const candidates = criteria.name ? budgets.filter((b) => b.name === criteria.name) : budgets;
  const [only, ...rest] = candidates;
  if (only && rest.length === 0) return only;

  let reason: string;
  if (criteria.name) {
    reason = only
      ? `multiple budgets named "${criteria.name}"; specify a sync id`
      : `no budget named "${criteria.name}" on server`;
  } else {
    reason = only
      ? "multiple budgets on server; specify a sync id or budget name"
      : "no budgets on server";
  }
  throw new BudgetSelectionError(`${reason}. available: ${available}`);
}
