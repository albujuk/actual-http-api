type Env = Record<string, string | undefined>;

// @actual-app/api reads NODE_ENV too, and "test" disables its prefs writes, backups and sync
// scheduling. So only these two values are accepted.
const ENVIRONMENTS = ["development", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export type Config = {
  environment: Environment;
  host: string;
  port: number;
  actualServerUrl: string;
  actualPassword: string;
  syncId?: string;
  budgetName?: string;
  dataDir: string;
  syncIntervalMs: number;
  docsEnabled: boolean;
};

// Node clamps timer delays outside 1..2^31-1 to 1ms.
const MAX_TIMER_MS = 2_147_483_647;

export function loadConfig(env: Env): Config {
  const environment = enumVar(env, "NODE_ENV", ENVIRONMENTS, "production");
  return {
    environment,
    host: optional(env, "HOST") ?? "127.0.0.1",
    port: intVar(env, "PORT", 3000, 1, 65_535),
    actualServerUrl: required(env, "ACTUAL_SERVER_URL"),
    actualPassword: required(env, "ACTUAL_PASSWORD"),
    syncId: optional(env, "ACTUAL_SYNC_ID"),
    budgetName: optional(env, "ACTUAL_BUDGET_NAME"),
    dataDir: optional(env, "DATA_DIR") ?? "./data",
    syncIntervalMs: intVar(env, "SYNC_INTERVAL_MS", 60_000, 1_000, MAX_TIMER_MS),
    // DOCS_ENABLED overrides the per-environment default: on in development, off in production.
    docsEnabled: boolVar(env, "DOCS_ENABLED", environment === "development"),
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

function enumVar<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const value = allowed.find((a) => a === raw);
  if (value === undefined) throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${raw}"`);
  return value;
}

function boolVar(env: Env, name: string, fallback: boolean): boolean {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be "true" or "false", got "${raw}"`);
}
