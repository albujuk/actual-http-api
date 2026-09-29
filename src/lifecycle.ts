export type ShutdownOptions = {
  onError: (err: unknown) => void;
  // Hard limit for the whole shutdown; exits 1 when exceeded.
  timeoutMs: number;
};

// Runs handler once on SIGTERM/SIGINT (exit 0) or a fatal error (exit 1), then exits.
export function onShutdown(handler: () => Promise<void>, { onError, timeoutMs }: ShutdownOptions): void {
  let stopping = false;

  const run = async (exitCode: number) => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => {
      onError(new Error(`shutdown timed out after ${timeoutMs}ms`));
      process.exit(1);
    }, timeoutMs).unref();
    try {
      await handler();
      process.exit(exitCode);
    } catch (err) {
      onError(err);
      process.exit(1);
    }
  };

  const fatal = (err: unknown) => {
    onError(err);
    if (stopping) process.exit(1);
    void run(1);
  };

  process.once("SIGTERM", () => void run(0));
  process.once("SIGINT", () => void run(0));
  process.on("unhandledRejection", fatal);
  process.on("uncaughtException", fatal);
}
