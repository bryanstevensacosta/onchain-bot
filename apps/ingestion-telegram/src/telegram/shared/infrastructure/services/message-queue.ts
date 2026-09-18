export class MessageQueue<T> {
  private queue: T[] = [];
  private waitingResolvers: Array<() => void> = [];

  push(item: T): void {
    this.queue.push(item);
    const resolver = this.waitingResolvers.shift();
    if (resolver) resolver();
  }

  shift(): T | undefined {
    return this.queue.shift();
  }

  get length(): number {
    return this.queue.length;
  }

  waitForItem(): Promise<void> {
    return new Promise((resolve) =>
      this.waitingResolvers.push(() => resolve()),
    );
  }

  flush(): void {
    const resolver = this.waitingResolvers.shift();
    if (resolver) resolver();
  }

  clear(): void {
    this.queue = [];
    this.waitingResolvers = [];
  }
}
