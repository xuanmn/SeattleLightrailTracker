/**
 * Run an async worker over `items` with at most `limit` tasks in flight.
 *
 * Unlike fixed-size batching, a new task starts the moment any slot frees up,
 * so one slow request (e.g. a stalled platform on a flaky connection) never
 * holds back the rest of the queue.
 *
 * Workers are expected to handle their own errors. `shouldContinue` is checked
 * before each new task starts, allowing cancellation without aborting tasks
 * that are already running.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  shouldContinue: () => boolean = () => true
): Promise<void> {
  let nextIndex = 0;

  const runner = async (): Promise<void> => {
    while (nextIndex < items.length && shouldContinue()) {
      const item = items[nextIndex++];
      await worker(item);
    }
  };

  const runnerCount = Math.max(0, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: runnerCount }, runner));
}
