import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';

export type RankingWindow = '30d' | '7d' | '1d';

export const RANKING_WINDOWS: ReadonlyArray<RankingWindow> = [
  '30d',
  '7d',
  '1d',
];

const DAY_MS = 24 * 3_600_000;

export const RANKING_WINDOW_MS: Record<RankingWindow, number> = {
  '30d': 30 * DAY_MS,
  '7d': 7 * DAY_MS,
  '1d': 1 * DAY_MS,
};

function trim(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}`;
}

/**
 * One precomputed ranking row per (caller, window) (Tramo 1, todo 12,
 * P11 + P17).
 *
 * Written ONLY by `TrackingCronService.rebuild()` — screens read, never
 * compute (P11: no calculation on-request). `totalX` is the SUM of
 * `last_mc/first_mc_at` over the caller's tracked pairs in the window;
 * `callsCount` the SUM of `times_called`; `strongCalls` the count of
 * pairs at >=5x (kol +5x rating input, backend `Outcome.STRONG` mirror).
 *
 * Display (P11 table `caller | 30D: +22X | 7D: +4X | 1D: +46%`): `+NX`
 * for 30d/7d, `+%` for 1d (total_x expressed as percent).
 */
export class KolWindowStat extends AggregateRoot<string> {
  private constructor(
    id: string,
    private readonly callerValue: string,
    private readonly windowValue: RankingWindow,
    private readonly totalXValue: number,
    private readonly callsCountValue: number,
    private readonly strongCallsValue: number,
  ) {
    super(id);
  }

  public static buildId(caller: string, window: RankingWindow): string {
    return `${caller}:${window}`;
  }

  public static create(input: {
    caller: string;
    window: RankingWindow;
    totalX: number;
    callsCount: number;
    strongCalls: number;
  }): KolWindowStat {
    if (!input.caller) {
      throw new DomainError(ErrorCode.VALIDATION, 'caller must not be empty');
    }
    if (!RANKING_WINDOWS.includes(input.window)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `unknown ranking window: ${input.window as string}`,
      );
    }
    if (!Number.isFinite(input.totalX) || input.totalX < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `totalX must be a finite number >= 0: ${input.totalX}`,
      );
    }
    if (!Number.isInteger(input.callsCount) || input.callsCount < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `callsCount must be an integer >= 0: ${input.callsCount}`,
      );
    }
    if (!Number.isInteger(input.strongCalls) || input.strongCalls < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `strongCalls must be an integer >= 0: ${input.strongCalls}`,
      );
    }
    return new KolWindowStat(
      KolWindowStat.buildId(input.caller, input.window),
      input.caller,
      input.window,
      Math.round(input.totalX * 10_000) / 10_000,
      input.callsCount,
      input.strongCalls,
    );
  }

  public get caller(): string {
    return this.callerValue;
  }

  public get window(): RankingWindow {
    return this.windowValue;
  }

  public get totalX(): number {
    return this.totalXValue;
  }

  public get callsCount(): number {
    return this.callsCountValue;
  }

  public get strongCalls(): number {
    return this.strongCallsValue;
  }

  public get display(): string {
    if (this.windowValue === '1d') {
      return `+${trim(this.totalXValue * 100)}%`;
    }
    return `+${trim(this.totalXValue)}X`;
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
