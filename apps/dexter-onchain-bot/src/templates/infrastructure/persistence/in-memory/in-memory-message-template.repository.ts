import { Injectable } from '@nestjs/common';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { MessageTemplateCommand } from '@/templates/domain/message-template.validators';
import type { MessageTemplateRepository } from '@/templates/domain/ports/message-template.repository';
import { MessageTemplateDuplicateError } from '../message-template.errors';

/**
 * In-memory `MessageTemplateRepository` (todo 3). Live binding when
 * `DATABASE_ENABLED=false` and in specs. Starts EMPTY — default seed
 * rows are inserted by the todo-9 seed service, never here.
 *
 * Mirrors TypeORM semantics so tests never lie:
 * - unique per `(command, name)` (exact match — the entity trims names
 *   at the boundary, so no case/whitespace folding is needed here).
 * - single active per command (mirrors the partial
 *   `UNIQUE(command) WHERE is_active` index: saving an active template
 *   while another of the same command is active throws).
 */
@Injectable()
export class InMemoryMessageTemplateRepository implements MessageTemplateRepository {
  private readonly store = new Map<string, MessageTemplate>();

  public async findAll(): Promise<ReadonlyArray<MessageTemplate>> {
    return [...this.store.values()].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  }

  public async findByCommand(
    command: MessageTemplateCommand,
  ): Promise<ReadonlyArray<MessageTemplate>> {
    return [...this.store.values()]
      .filter((template) => template.command === command)
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  public async findById(id: string): Promise<MessageTemplate | null> {
    return this.store.get(id) ?? null;
  }

  public async findActiveByCommand(
    command: MessageTemplateCommand,
  ): Promise<MessageTemplate | null> {
    for (const template of this.store.values()) {
      if (template.command === command && template.isActive) {
        return template;
      }
    }
    return null;
  }

  public async save(template: MessageTemplate): Promise<MessageTemplate> {
    for (const existing of this.store.values()) {
      if (existing.id === template.id) {
        continue;
      }
      if (
        existing.command === template.command &&
        existing.name === template.name
      ) {
        throw new MessageTemplateDuplicateError(
          `MessageTemplate (${template.command}, ${template.name}) already exists`,
          { command: template.command, name: template.name },
        );
      }
      if (
        template.isActive &&
        existing.command === template.command &&
        existing.isActive
      ) {
        throw new MessageTemplateDuplicateError(
          `MessageTemplate command ${template.command} already has an active template`,
          { command: template.command },
        );
      }
    }
    this.store.set(template.id, template);
    return template;
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
