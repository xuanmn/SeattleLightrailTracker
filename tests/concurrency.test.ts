import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency, createLazySingleton } from '../src/utils/concurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('runWithConcurrency', () => {
  it('never runs more than `limit` tasks at the same time', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runWithConcurrency(items, 3, async (i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, (i % 3) * 2));
      active--;
    });

    expect(peak).toBe(3);
    expect(active).toBe(0);
  });

  it('starts the next task as soon as any slot frees instead of waiting for the slowest in a batch', async () => {
    const slow = deferred();
    const fast = deferred();
    const started: string[] = [];

    const tasks: Record<string, Promise<void>> = {
      slow: slow.promise,
      fast: fast.promise,
      third: Promise.resolve(),
    };

    const run = runWithConcurrency(['slow', 'fast', 'third'], 2, async (name) => {
      started.push(name);
      await tasks[name];
    });

    await flush();
    expect(started).toEqual(['slow', 'fast']);

    // Free one slot while the slow task is still pending
    fast.resolve();
    await flush();
    expect(started).toEqual(['slow', 'fast', 'third']);

    slow.resolve();
    await run;
  });

  it('stops launching new tasks once shouldContinue returns false', async () => {
    const processed: number[] = [];
    let keepGoing = true;

    await runWithConcurrency(
      [1, 2, 3, 4, 5],
      1,
      async (n) => {
        processed.push(n);
        if (n === 2) keepGoing = false;
      },
      () => keepGoing
    );

    expect(processed).toEqual([1, 2]);
  });

  it('resolves immediately for an empty list', async () => {
    let calls = 0;
    await runWithConcurrency([], 4, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});

describe('createLazySingleton', () => {
  it('deduplicates concurrent calls and caches the resolved instance', async () => {
    const gate = deferred();
    const instance = { id: 'modal-1' };
    const factory = vi.fn(async () => {
      await gate.promise;
      return instance;
    });

    const load = createLazySingleton(factory);
    const p1 = load();
    const p2 = load();

    expect(factory).toHaveBeenCalledTimes(1);
    gate.resolve();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(instance);
    expect(r2).toBe(instance);

    const r3 = await load();
    expect(r3).toBe(instance);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('clears the cached promise on rejection so transient network failures can retry', async () => {
    let attempts = 0;
    const load = createLazySingleton(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Failed to fetch dynamically imported module');
      }
      return 'recovered-modal';
    });

    await expect(load()).rejects.toThrow('Failed to fetch dynamically imported module');
    expect(attempts).toBe(1);

    const recovered = await load();
    expect(recovered).toBe('recovered-modal');
    expect(attempts).toBe(2);
  });
});
