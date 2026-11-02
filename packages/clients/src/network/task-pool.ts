export interface TaskPoolOptions {
  maxConcurrent?: number;
  minIntervalMs?: number;
}

export class TaskPool {
  private readonly maxConcurrent: number;
  private readonly minIntervalMs: number;

  private queue: (() => void)[] = [];
  private running = 0;
  private nextStartAt = 0;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(option?: TaskPoolOptions) {
    this.maxConcurrent = option?.maxConcurrent ?? 5;
    this.minIntervalMs = option?.minIntervalMs ?? 200;
  }

  public schedule<T>(func: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        this.running += 1;

        Promise.resolve()
          .then(func)
          .then(resolve, reject)
          .finally(() => {
            this.running -= 1;
            this.pump();
          });
      });

      this.pump();
    });
  }

  private pump(): void {
    if (this.wakeTimer) return;

    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const now = Date.now();

      if (now < this.nextStartAt) {
        this.wakeTimer = setTimeout(() => {
          this.wakeTimer = null;
          this.pump();
        }, this.nextStartAt - now);

        return;
      }

      this.nextStartAt = now + this.minIntervalMs;
      const task = this.queue.shift();

      if (task) task();
    }
  }
}
