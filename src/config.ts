type Env = Record<string, string | undefined>;

export type Config = {
  host: string;
  port: number;
  actualServerUrl: string;
  actualPassword: string;
  syncId?: string;
  budgetName?: string;
  dataDir: string;
  syncIntervalMs: number;
};

// Node clamps timer delays outside 1..2^31-1 to 1ms.
const MAX_TIMER_MS = 2_147_483_647;

export function loadConfig(env: Env): Config {
  return {
    host: optional(env, "HOST") ?? "127.0.0.1",
    port: intVar(env, "PORT", 3000, 1, 65_535),
    actualServerUrl: required(env, "ACTUAL_SERVER_URL"),
    actualPassword: required(env, "ACTUAL_PASSWORD"),
    syncId: optional(env, "ACTUAL_SYNC_ID"),
    budgetName: optional(env, "ACTUAL_BUDGET_NAME"),
    dataDir: optional(env, "DATA_DIR") ?? "./data",
    syncIntervalMs: intVar(env, "SYNC_INTERVAL_MS", 60_000, 1_000, MAX_TIMER_MS),
  };
}

function optional(env: Env, name: string): string | undefined {
  return env[name] || undefined;
}

function required(env: Env, name: string): string {
  const value = optional(env, name);
  if (value === undefined) throw new Error(`missing required env var ${name}`);
  return value;
}

function intVar(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}
