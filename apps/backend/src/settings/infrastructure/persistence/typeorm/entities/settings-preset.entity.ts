import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'settings_presets' })
@Index('idx_one_active_preset', ['isActive'], {
  unique: true,
  where: '"is_active" = true',
})
export class SettingsPresetEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'name', type: 'varchar', length: 100, unique: true })
  public name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  public description!: string | null;

  @Column({ name: 'snapshot', type: 'jsonb' })
  public snapshot!: Record<string, unknown>;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: false,
  })
  public isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  public updatedAt!: Date;

  @Column({
    name: 'created_by',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  public createdBy!: string | null;
}
