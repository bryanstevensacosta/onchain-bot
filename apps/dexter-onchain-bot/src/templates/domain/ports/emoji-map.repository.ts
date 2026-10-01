import type { EmojiMap } from '../emoji-map.entity';

/**
 * Outbound port: persistence for the EmojiMap catalog (todo 5).
 * FK-less by design. The TypeORM adapter lands in this todo alongside
 * the in-memory adapter (live binding when `DATABASE_ENABLED=false`;
 * todo 13 wires the switch).
 */
export abstract class EmojiMapRepository {
  public abstract findAll(): Promise<readonly EmojiMap[]>;
  public abstract findByKey(
    placeholderKey: string,
  ): Promise<readonly EmojiMap[]>;
  public abstract findOne(id: string): Promise<EmojiMap | null>;
  public abstract save(map: EmojiMap): Promise<EmojiMap>;
  public abstract delete(id: string): Promise<boolean>;
}
