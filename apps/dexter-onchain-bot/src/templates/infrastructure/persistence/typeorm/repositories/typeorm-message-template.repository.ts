import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { MessageTemplateCommand } from '@/templates/domain/message-template.validators';
import type { MessageTemplateRepository } from '@/templates/domain/ports/message-template.repository';
import { MessageTemplateOrmEntity } from '../message-template.orm-entity';
import { MessageTemplateDuplicateError } from '../../message-template.errors';
import {
  toMessageTemplateDomain,
  toMessageTemplateRow,
} from '../mappers/message-template.mapper';

/**
 * TypeORM `MessageTemplateRepository` (todo 3). Live binding when
 * `DATABASE_ENABLED=true` (wired in todo 13).
 *
 * `save` is an upsert by PK (`Repository.save`). Unique violations on
 * `(command, name)` OR on the partial single-active-per-command index
 * surface as `MessageTemplateDuplicateError` (domain error, never a
 * raw 500). `QueryFailedError` copies driver props (incl. `code`) onto
 * itself, but the driver error is checked too (both read `23505`).
 *
 * NOTE: the todo-2 port is an `interface` (dexter local convention),
 * so this adapter `implements` it (sibling todo-5 port is an abstract
 * class, hence `extends` there). Constructor DI uses a value import
 * only (never `import type` on the injected `DataSource`).
 */
@Injectable()
export class TypeOrmMessageTemplateRepository implements MessageTemplateRepository {
  public constructor(private readonly dataSource: DataSource) {
    // Value import keeps design:paramtypes metadata (dexter AGENTS.md rule).
  }

  private rows(): Repository<MessageTemplateOrmEntity> {
    return this.dataSource.getRepository(MessageTemplateOrmEntity);
  }

  public async findAll(): Promise<ReadonlyArray<MessageTemplate>> {
    const rows = await this.rows().find({
      order: { createdAt: 'ASC' },
    });
    return rows.map(toMessageTemplateDomain);
  }

  public async findByCommand(
    command: MessageTemplateCommand,
  ): Promise<ReadonlyArray<MessageTemplate>> {
    const rows = await this.rows().find({
      where: { command },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toMessageTemplateDomain);
  }

  public async findById(id: string): Promise<MessageTemplate | null> {
    const row = await this.rows().findOne({ where: { id } });
    return row ? toMessageTemplateDomain(row) : null;
  }

  public async findActiveByCommand(
    command: MessageTemplateCommand,
  ): Promise<MessageTemplate | null> {
    const row = await this.rows().findOne({
      where: { command, isActive: true },
    });
    return row ? toMessageTemplateDomain(row) : null;
  }

  public async save(template: MessageTemplate): Promise<MessageTemplate> {
    try {
      const saved = await this.rows().save(toMessageTemplateRow(template));
      return toMessageTemplateDomain(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MessageTemplateDuplicateError(
          `MessageTemplate (${template.command}, ${template.name}) already exists or is already active`,
          { command: template.command, name: template.name },
        );
      }
      throw error;
    }
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.rows().delete(id);
    return (result.affected ?? 0) > 0;
  }
}

const isUniqueViolation = (error: unknown): boolean => {
  if (error instanceof QueryFailedError) {
    const code =
      (error as { code?: unknown }).code ??
      (error as { driverError?: { code?: unknown } }).driverError?.code;
    return code === '23505';
  }
  return false;
};
