import { Injectable } from '@nestjs/common';

/**
 * In-memory match-pipeline health (same contract as the backend state).
 *
 * Mutated ONLY by EnqueueMatchingCronScheduler.tick(); read ONLY by the
 * matching controller + health indicator. Never persisted — a restart
 * resets every field by design.
 */
@Injectable()
export class MatchingHealthState {
  public lastTickAt: string | null = null;
  public lastFetchOk: boolean | null = null;
  public consecutiveFetchFailures = 0;
  public lastEnqueuedAt: string | null = null;

  public recordFetchSuccess(at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
    this.lastFetchOk = true;
    this.consecutiveFetchFailures = 0;
  }

  public recordFetchFailure(at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
    this.lastFetchOk = false;
    this.consecutiveFetchFailures += 1;
  }

  public recordEnqueued(at: Date = new Date()): void {
    this.lastEnqueuedAt = at.toISOString();
  }
}
