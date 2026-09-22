import { Injectable } from '@nestjs/common';

@Injectable()
export class FloodWaitCounterService {
  private readonly records: Array<{ timestamp: number; seconds: number }> = [];

  public record(seconds: number): void {
    this.prune();
    this.records.push({ timestamp: Date.now(), seconds });
  }

  public get count24h(): number {
    this.prune();
    return this.records.length;
  }

  public get maxSeconds24h(): number {
    this.prune();
    if (this.records.length === 0) return 0;
    return Math.max(...this.records.map((r) => r.seconds));
  }

  public getConsecutiveFailures(): number {
    // This is tracked by FloodWaitHandlerService
    return 0;
  }

  public reset(): void {
    this.records.length = 0;
  }

  private prune(): void {
    const cutoff = Date.now() - 86_400_000;
    while (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records.shift();
    }
  }
}
