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

/**
 * Deduplicates concurrent async initialization calls (e.g. dynamic `import()` of modals),
 * caches the resolved value permanently, and clears the cached promise on rejection so
 * transient network drops (such as entering a light-rail tunnel) can retry cleanly.
 */
export function createLazySingleton<T>(factory: () => Promise<T>): () => Promise<T> {
  let resolved: T | undefined;
  let hasResolved = false;
  let inFlight: Promise<T> | undefined;

  return () => {
    if (hasResolved) return Promise.resolve(resolved as T);
    if (!inFlight) {
      inFlight = factory().then(
        (value) => {
          resolved = value;
          hasResolved = true;
          inFlight = undefined;
          return value;
        },
        (err) => {
          inFlight = undefined;
          throw err;
        }
      );
    }
    return inFlight;
  };
}
