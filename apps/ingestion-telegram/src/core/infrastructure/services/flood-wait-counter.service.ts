import { Injectable } from '@nestjs/common';

@Injectable()
export class FloodWaitCounterService {
  private readonly records: Array<{ timestamp: number; seconds: number }> = [];
  private consecutiveFailures = 0;

  public record(seconds: number): void {
    this.prune();
    this.records.push({ timestamp: Date.now(), seconds });
    this.consecutiveFailures += 1;
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
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
    return this.consecutiveFailures;
  }

  /**
   * Per Requirement 5.6: method aliases matching the HealthController
   * contract (the 24h window is already exposed as getters above).
   */
  public getCount24h(): number {
    return this.count24h;
  }

  public getMaxSeconds24h(): number {
    return this.maxSeconds24h;
  }

  public reset(): void {
    this.records.length = 0;
    this.consecutiveFailures = 0;
  }

  private prune(): void {
    const cutoff = Date.now() - 86_400_000;
    while (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records.shift();
    }
  }
}
