import { Injectable } from '@nestjs/common';
import { Source } from 'kol/source/domain/value-objects/source.vo';
import {
  KolSourceSeed,
  SourceAggregatorPort,
} from 'kol/source/application/ports/source-aggregator.port';

/**
 * Default `SourceAggregatorPort` implementation.
 *
 * Dedup rules:
 * - Same `kolId` collapses into one Source, with `messageIds` accumulated.
 * - First messageId wins for ordering; subsequent messageIds are sorted
 *   to keep the list deterministic.
 *
 * Lives in the application layer (not domain) because it orchestrates
 * two VOs (`Source` + `SourceType`) rather than enforcing a single
 * domain invariant.
 */
@Injectable()
export class DefaultSourceAggregator extends SourceAggregatorPort {
  public fromSeeds(seeds: ReadonlyArray<KolSourceSeed>): ReadonlyArray<Source> {
    const byKolId = new Map<string, KolSourceSeed>();
    for (const seed of seeds) {
      const prev = byKolId.get(seed.kolId);
      if (!prev) {
        byKolId.set(seed.kolId, seed);
        continue;
      }
      byKolId.set(seed.kolId, mergeSeed(prev, seed));
    }
    return Array.from(byKolId.values()).map(toSource);
  }

  public mergeSeed(
    existing: ReadonlyArray<Source>,
    seed: KolSourceSeed,
  ): ReadonlyArray<Source> {
    const idx = existing.findIndex((s) => s.kolId === seed.kolId);
    if (idx === -1) {
      return [...existing, toSource(seed)];
    }
    const updated = existing[idx];
    let next: Source = updated;
    for (const messageId of seed.messageIds) {
      next = next.addMessage(messageId);
    }
    const out = [...existing];
    out[idx] = next;
    return out;
  }
}

function mergeSeed(a: KolSourceSeed, b: KolSourceSeed): KolSourceSeed {
  const seen = new Set<number>();
  const messageIds: number[] = [];
  for (const id of a.messageIds) {
    if (!seen.has(id)) {
      seen.add(id);
      messageIds.push(id);
    }
  }
  for (const id of b.messageIds) {
    if (!seen.has(id)) {
      seen.add(id);
      messageIds.push(id);
    }
  }
  return {
    kolId: a.kolId,
    username: a.username ?? b.username,
    messageIds,
    sourceType: a.sourceType ?? b.sourceType,
  };
}

function toSource(seed: KolSourceSeed): Source {
  const [first, ...rest] = seed.messageIds;
  const base = Source.firstMention(
    seed.kolId,
    first ?? 0,
    seed.username,
    seed.sourceType,
  );
  return rest.reduce<Source>((acc, mid) => acc.addMessage(mid), base);
}
