import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * TypeORM persistence shape for the EmojiMap catalog (todo 5).
 *
 * Table-driven emoji config for the template renderer. Registered in
 * `DEXTER_PERSISTED_ENTITIES` (single registration point) so both the
 * runtime `DatabaseModule` and the CLI `data-source.ts` pick it up.
 * `matchValue` is stored lowercase-trimmed (see
 * `validateMatchValue`), so the composite unique constraint also rejects
 * case-variant duplicates (`Solana` vs `solana`).
 */
@Entity('dexter_emoji_maps')
@Unique('uq_dexter_emoji_maps_key_value', ['placeholderKey', 'matchValue'])
export class EmojiMapOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 40 })
  public placeholderKey!: string;

  @Column({ type: 'varchar', length: 40 })
  public matchValue!: string;

  @Column({ type: 'varchar', length: 64 })
  public emoji!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;
}
