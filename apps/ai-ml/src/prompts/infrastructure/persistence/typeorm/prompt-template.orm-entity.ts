import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * TypeORM persistence shape for the versioned global prompt catalog.
 * NOT wired into a module yet (same GAP-1 pattern as the
 * feed-publisher migration source): live reads use the in-memory
 * adapter. One row per (name, version); exactly one row per name
 * carries `isActive = true` (the rollback pointer).
 */
@Entity('ai_ml_prompt_templates')
@Index('uq_ai_ml_prompt_templates_name_version', ['name', 'version'], {
  unique: true,
})
export class PromptTemplateOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 100 })
  public name!: string;

  @Column({ type: 'int' })
  public version!: number;

  @Column({ type: 'text' })
  public content!: string;

  @Column({ type: 'text', default: '' })
  public systemContent!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  public variables!: string[];

  @Column({ type: 'varchar', length: 16, default: 'global' })
  public contentType!: string;

  @Column({ type: 'boolean', default: true })
  public isActive!: boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
