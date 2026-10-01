import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * TypeORM persistence shape for the GLOBAL prompt-template catalog.
 * NOT wired into a module yet (GAP-1); live reads use the in-memory
 * adapter. `contentType` scopes rows (`crypto-news` / `threads` /
 * `global`); keyword bindings are FK-less strings.
 */
@Entity('feed_prompt_templates')
@Index('uq_feed_prompt_templates_name', ['name'], { unique: true })
export class PromptTemplateOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 100 })
  public name!: string;

  @Column({ type: 'text', nullable: true })
  public description!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'global' })
  public contentType!: string;

  @Column({ type: 'varchar', length: 200 })
  public model!: string;

  @Column({ type: 'boolean', default: true })
  public supportsVision!: boolean;

  @Column({ type: 'int', default: 800 })
  public maxTokens!: number;

  @Column({ type: 'float', default: 0.7 })
  public temperature!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  public reasoningEffort!: string | null;

  @Column({ type: 'text' })
  public promptText!: string;

  @Column({ type: 'text', default: '' })
  public systemPromptText!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
