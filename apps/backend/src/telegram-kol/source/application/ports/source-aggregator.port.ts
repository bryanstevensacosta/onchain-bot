import { Source } from 'telegram-kol/source/domain/value-objects/source.vo';
import { SourceType } from 'telegram-kol/source/domain/value-objects/source-type.vo';

export interface KolSourceSeed {
  readonly kolId: string;
  readonly username: string | null;
  readonly messageIds: ReadonlyArray<number>;
  readonly sourceType?: SourceType;
}

/**
 * Outbound port: aggregate a list of mentions into a deduplicated
 * list of `Source` aggregates (one per KOL).
 *
 * Consumers (e.g. `token/normalization/`) hand in raw mention payloads
 * keyed by `kolId`; the implementation applies the dedup-by-kolId +
 * accumulate-messageIds rule owned by the `Source` value object so the
 * normalization BC does not need to import the VO directly.
 *
 * Fase 3 of the kol-refactor plan: this port exists so `token/normalization/`
 * can depend on `kol/source/` through an abstraction rather than via a
 * direct VO import.
 */
export abstract class SourceAggregatorPort {
  public abstract fromSeeds(
    seeds: ReadonlyArray<KolSourceSeed>,
  ): ReadonlyArray<Source>;
  public abstract mergeSeed(
    existing: ReadonlyArray<Source>,
    seed: KolSourceSeed,
  ): ReadonlyArray<Source>;
}
