import { NotReadyError } from "./errors.js";
import type { BudgetStatus } from "./types.js";

export function requireLoaded(status: BudgetStatus): void {
  if (!status.loadedBudget()) throw new NotReadyError("no budget loaded");
}
