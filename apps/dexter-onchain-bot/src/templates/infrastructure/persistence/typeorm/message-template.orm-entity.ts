import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/**
 * TypeORM persistence shape for the MessageTemplate catalog (todo 3).
 *
 * Global per command, FK-less by design. Registered in
 * `DEXTER_PERSISTED_ENTITIES` (single registration point) so both the
 * runtime `DatabaseModule` and the CLI `data-source.ts` pick it up.
 *
 * Uniqueness is repository-owned (entity owns field invariants only):
 * - `(command, name)` composite unique (lookup key per command).
 * - partial unique on `(command)` WHERE active (single active template
 *   per command; concurrent activates race on this index — losers get
 *   `23505`, mapped to `MessageTemplateDuplicateError`, never raw 500).
 *
 * Column naming follows the sibling `display-map.orm-entity.ts` convention
 * (camelCase properties, TypeORM default naming — NOT snake_case).
 */
@Entity('dexter_message_templates')
@Unique('uq_dexter_message_templates_command_name', ['command', 'name'])
@Index('uq_dexter_message_templates_command_active', ['command'], {
  unique: true,
  where: '"isActive" = TRUE',
})
export class MessageTemplateOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 16 })
  public command!: string;

  @Column({ type: 'varchar', length: 100 })
  public name!: string;

  @Column({ type: 'text' })
  public bodyMarkdown!: string;

  @Column({ type: 'boolean', default: false })
  public isActive!: boolean;

  @Column({ type: 'int', default: 1 })
  public version!: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
