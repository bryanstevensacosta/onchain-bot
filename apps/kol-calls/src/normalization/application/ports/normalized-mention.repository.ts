import { NormalizedMention } from '../../domain/entities/normalized-mention.entity';

export abstract class NormalizedMentionRepository {
  abstract save(mention: NormalizedMention): Promise<void>;
  abstract findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<NormalizedMention>>;
  abstract findRecent(limit: number): Promise<ReadonlyArray<NormalizedMention>>;
  abstract count(): Promise<number>;
  /**
   * P51 contract reads: keyed single fetch + paginated list (stable
   * insertion order, offset-based). The publisher sync consumes these —
   * never the DB directly.
   */
  abstract findById(id: string): Promise<NormalizedMention | null>;
  abstract findPaged(
    limit: number,
    offset: number,
  ): Promise<ReadonlyArray<NormalizedMention>>;
}
