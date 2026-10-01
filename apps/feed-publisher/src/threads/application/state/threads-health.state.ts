import { Injectable } from '@nestjs/common';

/**
 * In-memory threads publish health (same shape as the queue health
 * state). Mutated ONLY by the threads cron tick; read ONLY by the
 * threads controller (v2) + health indicator. Never persisted.
 */
@Injectable()
export class ThreadsHealthState {
  public lastTickAt: string | null = null;
  public lastProcessedAt: string | null = null;
  public consecutiveFailures = 0;
  public lastError: string | null = null;

  public recordTick(at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
  }

  public recordProcessed(at: Date = new Date()): void {
    this.lastProcessedAt = at.toISOString();
    this.consecutiveFailures = 0;
    this.lastError = null;
  }

  public recordFailure(reason: string, at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
    this.consecutiveFailures += 1;
    this.lastError = reason;
  }
}
