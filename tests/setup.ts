import { beforeEach } from 'vitest';

// Minimal localStorage mock — jsdom's isn't available at setup-file evaluation time.
const store = new Map<string, string>();
const mockStorage: Storage = {
  get length() { return store.size; },
  clear() { store.clear(); },
  getItem(key: string) { return store.get(key) ?? null; },
  key(index: number) { return [...store.keys()][index] ?? null; },
  removeItem(key: string) { store.delete(key); },
  setItem(key: string, value: string) { store.set(key, String(value)); },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
});

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;

  public targets: Set<Element> = new Set();

  constructor(
    public callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.rootMargin = options?.rootMargin ?? '';
    this.thresholds = options?.threshold
      ? Array.isArray(options.threshold) ? options.threshold : [options.threshold]
      : [0];
  }

  observe(target: Element): void { this.targets.add(target); }
  unobserve(target: Element): void { this.targets.delete(target); }
  disconnect(): void { this.targets.clear(); }
  takeRecords(): IntersectionObserverEntry[] { return []; }

  trigger(entries: Partial<IntersectionObserverEntry>[]): void {
    this.callback(
      entries.map((e) => ({
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: e.isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRectReadOnly,
        isIntersecting: false,
        isVisible: false,
        rootBounds: null,
        target: document.createElement('div'),
        time: Date.now(),
        ...e,
      })) as IntersectionObserverEntry[],
      this
    );
  }
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: MockIntersectionObserver,
  writable: true,
});

beforeEach(() => {
  localStorage.clear();
});
