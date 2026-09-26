import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface CronField {
  readonly min: number;
  readonly max: number;
  readonly names?: Readonly<Record<string, number>>;
}

const FIELDS: CronField[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6, names: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } },
];

/**
 * Minimal strict 5-field cron (contract: ONLY UTC, dayKeys UTC
 * everywhere). Supports `*`, steps (`*\/15`), ranges (`9-17`),
 * lists (`1,15`) and weekday names. No external dep — deterministic
 * and fully testable. Anything outside the 5-field shape is a 422.
 */
export class CronDueChecker {
  public static assertValid(cronExpr: string): void {
    CronDueChecker.parse(cronExpr);
  }

  /** Minute-granularity due check against the given instant (UTC). */
  public static isDue(cronExpr: string, at: Date): boolean {
    const sets = CronDueChecker.parse(cronExpr);
    const values = [
      at.getUTCMinutes(),
      at.getUTCHours(),
      at.getUTCDate(),
      at.getUTCMonth() + 1,
      at.getUTCDay(),
    ];
    return sets.every((set, index) => set.has(values[index]));
  }

  private static parse(cronExpr: string): Array<Set<number>> {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new DomainError(
        ErrorCode.SCHEDULE_INVALID,
        `cronExpr must be a 5-field UTC cron (got ${parts.length} fields): ${cronExpr}`,
      );
    }
    return parts.map((part, index) => CronDueChecker.parseField(part, FIELDS[index], cronExpr));
  }

  private static parseField(
    raw: string,
    field: CronField,
    expr: string,
  ): Set<number> {
    const out = new Set<number>();
    const fail = (): never => {
      throw new DomainError(
        ErrorCode.SCHEDULE_INVALID,
        `invalid cron field '${raw}' in '${expr}'`,
      );
    };
    const normalize = (token: string): number => {
      const lowered = token.toLowerCase();
      if (field.names && lowered in field.names) {
        return field.names[lowered];
      }
      if (!/^\d+$/.test(token)) fail();
      const value = parseInt(token, 10);
      if (value < field.min || value > field.max) fail();
      return value;
    };
    for (const item of raw.split(',')) {
      if (item === '') fail();
      const [range, stepRaw] = item.split('/');
      const step = stepRaw === undefined ? 1 : parseInt(stepRaw, 10);
      if (!Number.isInteger(step) || step < 1) fail();
      let from: number;
      let to: number;
      if (range === '*') {
        from = field.min;
        to = field.max;
      } else if (range.includes('-')) {
        const [a, b] = range.split('-');
        if (a === '' || b === '') fail();
        from = normalize(a);
        to = normalize(b);
        if (from > to) fail();
      } else {
        from = normalize(range);
        to = range === '*' ? field.max : from;
      }
      for (let value = from; value <= to; value += step) {
        out.add(value);
      }
    }
    if (out.size === 0) fail();
    return out;
  }
}
