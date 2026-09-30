import { readFileSync } from "node:fs";
import { loadConfig, type Config } from "./config.js";
import { ActualConnection } from "./core/actual/actual-connection.js";
import { selectBudget } from "./core/actual/budget-selection.js";
import { BudgetWriteQueue } from "./core/actual/write-queue.js";
import { buildApp } from "./core/http/app.js";
import { PeriodicSync } from "./core/sync/periodic-sync.js";
import { AccountQueries } from "./features/accounts/account-queries.js";
import { accountRoutes } from "./features/accounts/account-routes.js";
import { BudgetMonthQueries } from "./features/budget-months/budget-month-queries.js";
import { budgetMonthRoutes } from "./features/budget-months/budget-month-routes.js";
import { ApiBudgetAmountWriter } from "./features/budget-months/budget-month-writer.js";
import { budgetRoutes } from "./features/budgets/budget-routes.js";
import { CategoryQueries } from "./features/categories/category-queries.js";
import { categoryRoutes } from "./features/categories/category-routes.js";
import { healthRoutes } from "./features/health/health-routes.js";
import { idRoutes } from "./features/ids/id-routes.js";
import { ApiNameResolver } from "./features/ids/name-resolver.js";
import { PayeeQueries } from "./features/payees/payee-queries.js";
import { payeeRoutes } from "./features/payees/payee-routes.js";
import { TransactionQueries } from "./features/transactions/transaction-queries.js";
import { transactionRoutes } from "./features/transactions/transaction-routes.js";
import { ApiTransactionWriter } from "./features/transactions/transaction-writer.js";
import { onShutdown } from "./lifecycle.js";

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

// Writes and periodic syncs share one queue, so they never interleave.
const writes = new BudgetWriteQueue(connection, (err) => app.log.error(err, "sync after write failed"));

const periodicSync = new PeriodicSync(writes, config.syncIntervalMs, (err) =>
  app.log.error(err, "periodic sync failed"),
);

// package.json sits one level above both src/ and dist/.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const accounts = new AccountQueries(connection);
const categories = new CategoryQueries(connection);
const payees = new PayeeQueries(connection);
const budgetMonths = new BudgetMonthQueries(connection);

const app = buildApp(
  [
    healthRoutes(connection, periodicSync),
    budgetRoutes(connection),
    accountRoutes(accounts),
    transactionRoutes(
      new TransactionQueries(connection, accounts),
      new ApiTransactionWriter(writes, accounts, categories, payees),
    ),
    categoryRoutes(categories),
    payeeRoutes(payees),
    budgetMonthRoutes(budgetMonths, new ApiBudgetAmountWriter(writes, budgetMonths, categories)),
    idRoutes(new ApiNameResolver(connection)),
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
    // Waits for in-flight requests, then the queue settles any write they left behind.
    await app.close();
    await writes.close();
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
