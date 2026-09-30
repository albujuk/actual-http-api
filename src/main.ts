import { readFileSync } from "node:fs";
import { loadConfig, type Config } from "./config.js";
import { AccountQueries } from "./actual/account-queries.js";
import { ActualConnection } from "./actual/actual-connection.js";
import { selectBudget } from "./actual/budget-selection.js";
import { BudgetSync } from "./actual/budget-sync.js";
import { CategoryQueries } from "./actual/category-queries.js";
import { TransactionQueries } from "./actual/transaction-queries.js";
import { buildApp } from "./http/app.js";
import { accountRoutes } from "./http/routes/accounts.js";
import { budgetRoutes } from "./http/routes/budgets.js";
import { categoryRoutes } from "./http/routes/categories.js";
import { healthRoutes } from "./http/routes/health.js";
import { transactionRoutes } from "./http/routes/transactions.js";
import { onShutdown } from "./lifecycle.js";
import { PeriodicSync } from "./sync/periodic-sync.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  // No logger exists yet, so this is the one place that writes to the console.
  console.error(`config error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const connection = new ActualConnection({
  serverUrl: config.actualServerUrl,
  password: config.actualPassword,
  dataDir: config.dataDir,
});

const periodicSync = new PeriodicSync(new BudgetSync(connection), config.syncIntervalMs, (err) =>
  app.log.error(err, "periodic sync failed"),
);

// package.json sits one level above both src/ and dist/.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const accounts = new AccountQueries(connection);

const app = buildApp(
  [
    healthRoutes(connection, periodicSync),
    budgetRoutes(connection),
    accountRoutes(accounts),
    transactionRoutes(new TransactionQueries(connection, accounts)),
    categoryRoutes(new CategoryQueries(connection)),
  ],
  { docs: config.docsEnabled, version },
);

const shutdown = new AbortController();
const startup = start(shutdown.signal);

onShutdown(
  async () => {
    shutdown.abort();
    // connect/download can't be cancelled; wait for the current step, bounded by the timeout.
    await startup;
    await periodicSync.stop();
    await app.close();
    await connection.close();
  },
  { onError: (err) => app.log.error(err, "shutdown failed"), timeoutMs: SHUTDOWN_TIMEOUT_MS },
);

// Never rejects: failures exit the process, and an abort from shutdown returns quietly.
async function start(signal: AbortSignal): Promise<void> {
  try {
    await app.listen({ port: config.port, host: config.host });
    signal.throwIfAborted();
    await connection.connect();
    signal.throwIfAborted();
    const budget = selectBudget(await connection.listBudgets(), {
      syncId: config.syncId,
      name: config.budgetName,
    });
    await connection.load(budget);
    signal.throwIfAborted();
    app.log.info({ budget }, "budget loaded");
    periodicSync.start();
  } catch (err) {
    if (signal.aborted) return;
    app.log.error(err, "failed to start bridge");
    process.exit(1);
  }
}
