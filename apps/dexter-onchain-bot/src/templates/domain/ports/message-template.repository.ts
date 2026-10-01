/**
 * Outbound port: persistence for the MessageTemplate catalog (todo 2).
 *
 * Interface (dexter local convention — `ChatGroupRepository` pattern;
 * todo 13 binds it behind a symbol token). Global per command, FK-less
 * by design. TypeORM adapter lands with todo 3; the in-memory adapter
 * is the live binding until then.
 */

import type { MessageTemplate } from '../message-template.entity';
import type { MessageTemplateCommand } from '../message-template.validators';

export interface MessageTemplateRepository {
  findAll(): Promise<ReadonlyArray<MessageTemplate>>;
  findByCommand(
    command: MessageTemplateCommand,
  ): Promise<ReadonlyArray<MessageTemplate>>;
  findById(id: string): Promise<MessageTemplate | null>;
  findActiveByCommand(
    command: MessageTemplateCommand,
  ): Promise<MessageTemplate | null>;
  save(template: MessageTemplate): Promise<MessageTemplate>;
  delete(id: string): Promise<boolean>;
}
