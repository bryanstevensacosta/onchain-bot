import { Injectable } from '@nestjs/common';
import type { SchedulingTarget } from '../../domain/scheduling-target';

/**
 * In-memory scheduling health (same shape as the queue health state).
 *
 * Mutated ONLY by the scheduling tick/publish path; read ONLY by the
 * scheduling controllers + health indicator. Never persisted.
 */
@Injectable()
export class SchedulingHealthState {
  public lastTickAt: string | null = null;
  public lastPublishedAt: Record<SchedulingTarget, string | null> = {
    telegram: null,
    threads: null,
  };
  public publishedToday: Record<SchedulingTarget, number> = {
    telegram: 0,
    threads: 0,
  };
  public consecutiveFailures = 0;
  public lastError: string | null = null;

  public recordTick(at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
  }

  public recordPublished(
    target: SchedulingTarget,
    at: Date = new Date(),
  ): void {
    this.lastPublishedAt[target] = at.toISOString();
    this.lastTickAt = at.toISOString();
    this.consecutiveFailures = 0;
    this.lastError = null;
  }

  public recordFailure(reason: string, at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
    this.consecutiveFailures += 1;
    this.lastError = reason;
  }
}
