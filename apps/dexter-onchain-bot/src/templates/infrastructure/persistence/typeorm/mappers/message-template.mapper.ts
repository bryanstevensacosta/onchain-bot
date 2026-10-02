import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { MessageTemplateOrmEntity } from '../message-template.orm-entity';

/**
 * Domain <-> TypeORM mapper for `MessageTemplate` (todo 3).
 *
 * `reconstitute` skips validation (trusts persisted rows, mirrors
 * feed-publisher `toPromptTemplateDomain`). Body is stored verbatim —
 * no trim (author-owned MarkdownV2 whitespace).
 */
export const toMessageTemplateRow = (
  template: MessageTemplate,
): MessageTemplateOrmEntity => {
  const row = new MessageTemplateOrmEntity();
  row.id = template.id;
  row.command = template.command;
  row.name = template.name;
  row.bodyMarkdown = template.bodyMarkdown;
  row.isActive = template.isActive;
  row.version = template.version;
  row.createdAt = template.createdAt;
  row.updatedAt = template.updatedAt;
  return row;
};

export const toMessageTemplateDomain = (
  row: MessageTemplateOrmEntity,
): MessageTemplate =>
  MessageTemplate.reconstitute({
    id: row.id,
    command: row.command as MessageTemplate['command'],
    name: row.name,
    bodyMarkdown: row.bodyMarkdown,
    isActive: row.isActive,
    version: Number(row.version),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

/** Short aliases (plan §98 `toDomain/toRow` contract names). */
export const toRow = toMessageTemplateRow;
export const toDomain = toMessageTemplateDomain;
