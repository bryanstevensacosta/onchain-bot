import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'settings_filters' })
@Index('idx_settings_filters_type', ['type'])
@Index('idx_settings_filters_scope', ['scope'])
export class SettingsFilterEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'type', type: 'varchar', length: 64 })
  public type!: string;

  @Column({ name: 'value', type: 'varchar', length: 256 })
  public value!: string;

  @Column({
    name: 'numeric_value',
    type: 'real',
    nullable: true,
  })
  public numericValue!: number | null;

  @Column({
    name: 'scope',
    type: 'enum',
    enum: ['token', 'kol', 'all', 'global'],
  })
  public scope!: 'token' | 'kol' | 'all' | 'global';

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  public notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
