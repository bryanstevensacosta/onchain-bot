import { NormalizedMention } from '../../domain/entities/normalized-mention.entity';

export abstract class NormalizedMentionRepository {
  abstract save(mention: NormalizedMention): Promise<void>;
  abstract findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<NormalizedMention>>;
  abstract findRecent(limit: number): Promise<ReadonlyArray<NormalizedMention>>;
  abstract count(): Promise<number>;
}
