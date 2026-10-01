import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * TypeORM persistence shape for the DisplayMap catalog
 * (display-catalog rename).
 *
 * Table-driven display config for the template renderer. Registered in
 * `DEXTER_PERSISTED_ENTITIES` (single registration point) so both the
 * runtime `DatabaseModule` and the CLI `data-source.ts` pick it up.
 * `matchValue` is stored lowercase-trimmed (see
 * `validateMatchValue`), so the composite unique constraint also rejects
 * case-variant duplicates (`Solana` vs `solana`).
 */
@Entity('dexter_display_maps')
@Unique('uq_dexter_display_maps_key_value', ['placeholderKey', 'matchValue'])
export class DisplayMapOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 40 })
  public placeholderKey!: string;

  @Column({ type: 'varchar', length: 40 })
  public matchValue!: string;

  @Column({ type: 'varchar', length: 64 })
  public display!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;
}
