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

/**
 * DI token for the repository (todo 6, dexter-message-templates).
 *
 * The port is an `interface` (dexter `ChatGroupRepository` convention),
 * so — unlike the abstract-class `DisplayMapRepository` — it cannot
 * serve as its own Nest token. `DexterModule` binds
 * `{ provide: MESSAGE_TEMPLATE_REPOSITORY, useExisting:
 * InMemoryMessageTemplateRepository }` (todo 13 adds the TypeORM
 * switch behind the same token).
 */
export const MESSAGE_TEMPLATE_REPOSITORY = Symbol(
  'MESSAGE_TEMPLATE_REPOSITORY',
);
