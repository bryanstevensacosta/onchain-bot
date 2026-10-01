/**
 * MessageTemplate aggregate (todo 2, dexter-message-templates).
 *
 * Pure domain — no Nest, no TypeORM (infra is todo 3). Mirrors the SHAPE
 * of `apps/feed-publisher/src/llm/domain/prompt-template.entity.ts`
 * (canon vivo): private state + `create`/`reconstitute` factories +
 * validated mutations. Dexter owns no shared kernel `AggregateRoot`,
 * so this is a plain class with local domain errors (plan §91).
 *
 * Uniqueness (`name` per command, single active per command) is a
 * REPOSITORY concern (partial unique indexes, todo 3) — the entity
 * owns field invariants only.
 */

import {
  validateBodyMarkdown,
  validateCommand,
  validateName,
  validateVersion,
  type MessageTemplateCommand,
} from './message-template.validators';

export type { MessageTemplateCommand } from './message-template.validators';

export interface MessageTemplateProps {
  readonly id: string;
  command: MessageTemplateCommand;
  name: string;
  bodyMarkdown: string;
  isActive: boolean;
  version: number;
  readonly createdAt: Date;
  updatedAt: Date;
}

export class MessageTemplate {
  private state: MessageTemplateProps;

  protected constructor(id: string, props: MessageTemplateProps) {
    void id;
    this.state = props;
  }

  public static create(input: {
    id?: string;
    command: MessageTemplateCommand;
    name: string;
    bodyMarkdown: string;
    isActive?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }): MessageTemplate {
    const command = validateCommand(input.command);
    const name = validateName(input.name);
    const bodyMarkdown = validateBodyMarkdown(input.bodyMarkdown);
    const now = new Date();
    const id = input.id ?? crypto.randomUUID();
    return new MessageTemplate(id, {
      id,
      command,
      name,
      bodyMarkdown,
      isActive: input.isActive ?? false,
      version: 1,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
  }

  public static reconstitute(input: {
    id: string;
    command: MessageTemplateCommand;
    name: string;
    bodyMarkdown: string;
    isActive: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): MessageTemplate {
    return new MessageTemplate(input.id, { ...input });
  }

  public get id(): string {
    return this.state.id;
  }

  public get command(): MessageTemplateCommand {
    return this.state.command;
  }

  public get name(): string {
    return this.state.name;
  }

  public get bodyMarkdown(): string {
    return this.state.bodyMarkdown;
  }

  public get isActive(): boolean {
    return this.state.isActive;
  }

  public get version(): number {
    return this.state.version;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  public rename(name: string): void {
    this.state.name = validateName(name);
    this.touch();
  }

  public updateBody(bodyMarkdown: string): void {
    this.state.bodyMarkdown = validateBodyMarkdown(bodyMarkdown);
    this.touch();
  }

  public activate(): void {
    this.state.isActive = true;
    this.state.updatedAt = new Date();
  }

  public deactivate(): void {
    this.state.isActive = false;
    this.state.updatedAt = new Date();
  }

  public bumpVersion(): void {
    this.state.version = validateVersion(this.state.version + 1);
    this.state.updatedAt = new Date();
  }

  private touch(): void {
    this.bumpVersion();
  }
}
