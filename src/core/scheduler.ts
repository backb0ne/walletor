export interface RateLimitedPoolOptions {
  concurrency?: number;
  defaultMinIntervalMs?: number;
  keyMinIntervalMs?: Partial<Record<string, number>>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimitedPool {
  private readonly concurrency: number;
  private readonly defaultMinIntervalMs: number;
  private readonly keyMinIntervalMs: Map<string, number>;
  private readonly nextAllowedAt = new Map<string, number>();
  private readonly waitQueue: Array<() => void> = [];
  private activeCount = 0;

  constructor(options?: number | RateLimitedPoolOptions) {
    const resolved: RateLimitedPoolOptions =
      typeof options === 'number' ? { concurrency: options } : (options ?? {});

    const concurrency = resolved.concurrency ?? 8;
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      throw new Error(`Invalid concurrency: ${concurrency}`);
    }

    this.concurrency = Math.floor(concurrency);
    this.defaultMinIntervalMs = Math.max(0, resolved.defaultMinIntervalMs ?? 0);
    this.keyMinIntervalMs = new Map();

    if (resolved.keyMinIntervalMs) {
      for (const [key, interval] of Object.entries(resolved.keyMinIntervalMs)) {
        if (typeof interval === 'number' && interval > 0) {
          this.keyMinIntervalMs.set(key, interval);
        }
      }
    }
  }

  get active(): number {
    return this.activeCount;
  }

  get pending(): number {
    return this.waitQueue.length;
  }

  setKeyInterval(key: string, minIntervalMs: number): void {
    if (minIntervalMs <= 0) {
      this.keyMinIntervalMs.delete(key);
    } else {
      this.keyMinIntervalMs.set(key, minIntervalMs);
    }
  }

  private async waitForKeyRateLimit(key?: string): Promise<void> {
    if (!key) {
      return;
    }

    const intervalMs = this.keyMinIntervalMs.get(key) ?? this.defaultMinIntervalMs;
    if (intervalMs <= 0) {
      return;
    }

    const now = Date.now();
    const prevNext = this.nextAllowedAt.get(key) ?? now;
    const scheduledAt = Math.max(now, prevNext);
    this.nextAllowedAt.set(key, scheduledAt + intervalMs);

    const waitMs = scheduledAt - now;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeCount < this.concurrency) {
      this.activeCount++;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    this.activeCount++;
  }

  private releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  async runWithLimit<T>(fn: () => Promise<T>, key?: string): Promise<T> {
    await this.waitForKeyRateLimit(key);
    await this.acquireSlot();
    try {
      return await fn();
    } finally {
      this.releaseSlot();
    }
  }

  async mapConcurrent<T, R>(
    items: readonly T[],
    fn: (item: T, index: number) => Promise<R>,
    keyFn?: (item: T, index: number) => string | undefined,
  ): Promise<R[]> {
    const tasks = items.map((item, index) => {
      const key = keyFn ? keyFn(item, index) : undefined;
      return this.runWithLimit(() => fn(item, index), key);
    });
    return Promise.all(tasks);
  }
}
