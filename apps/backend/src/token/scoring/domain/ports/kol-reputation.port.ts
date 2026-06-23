import { SourceType } from 'telegram-kol/source/domain/value-objects/source-type.vo';
import { KolReputationSummary } from 'token/scoring/domain/value-objects/kol-reputation-summary.vo';

/**
 * Outbound port: look up the reputation of one or more KOLs.
 *
 * `sourceType` defaults to `'TELEGRAM'` for backward compatibility
 * (v1 only has Telegram KOLs). When Discord is added, callers
 * pass the source type explicitly.
 *
 * Implemented by adapters that may use:
 * - Hard-coded "known good" lists (via `KnownKolPort` from `telegram-kol/reputation`)
 * - A database of historical accuracy (which KOLs called ATHs that held up)
 * - External reputation services
 *
 * Returns `KolReputationSummary.unknown(kolId)` for unrecognized KOLs
 * (default 0.5 score, not trusted, not suspicious).
 */
export abstract class KolReputationPort {
  public abstract getReputation(
    kolId: string,
    sourceType?: SourceType,
  ): Promise<KolReputationSummary>;

  public abstract getAverageReputation(
    kolIds: ReadonlyArray<string>,
    sourceType?: SourceType,
  ): Promise<number>;
}
