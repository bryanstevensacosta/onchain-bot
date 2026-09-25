import { BlacklistPhrase } from '../../domain/blacklist-phrase.entity';

/**
 * Outbound port: persistence for blacklist phrases.
 *
 * FK-less by design (spec recommendation): no joins, no constraints.
 * Small table, no pagination. TypeORM adapter lands with the
 * persistence todo (GAP-1); the in-memory adapter is live until then.
 */
export abstract class BlacklistPhraseRepository {
  public abstract findAll(): Promise<ReadonlyArray<BlacklistPhrase>>;
  public abstract findEnabled(): Promise<ReadonlyArray<BlacklistPhrase>>;
  public abstract save(blacklistPhrase: BlacklistPhrase): Promise<void>;
  public abstract delete(id: string): Promise<void>;
}
