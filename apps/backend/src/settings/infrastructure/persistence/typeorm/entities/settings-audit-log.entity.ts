import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'settings_audit_log' })
@Index('idx_settings_audit_log_entity_type', ['entityType'])
@Index('idx_settings_audit_log_entity_id', ['entityId'])
@Index('idx_settings_audit_log_entity_type_id', ['entityType', 'entityId'])
export class SettingsAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  public entityType!: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 128 })
  public entityId!: string;

  @Column({
    name: 'action',
    type: 'enum',
    enum: ['CREATE', 'UPDATE', 'DELETE'],
  })
  public action!: 'CREATE' | 'UPDATE' | 'DELETE';

  @Column({ name: 'before', type: 'jsonb', nullable: true })
  public before!: Record<string, unknown> | null;

  @Column({ name: 'after', type: 'jsonb', nullable: true })
  public after!: Record<string, unknown> | null;

  @Column({ name: 'source_ip', type: 'varchar', length: 45, nullable: true })
  public sourceIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
