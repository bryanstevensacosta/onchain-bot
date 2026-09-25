import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  PublishingSession,
  type CreatePublishingSessionInput,
} from '../../domain/entities/publishing-session.entity';
import { PublishingSessionRepository } from '../../domain/ports/publishing-session.repository';
import { ContentTemplateRepository } from '../../../template/domain/ports/content-template.repository';

export interface PublishingSessionView {
  readonly id: string;
  readonly name: string;
  readonly templateId: string | null;
  readonly active: boolean;
  readonly matchingEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly keywordIds: ReadonlyArray<string>;
  readonly sourceToggles: Record<string, boolean>;
  readonly telegramTargets: ReadonlyArray<{ botId: string; chatId: string }>;
  readonly threadsTargets: ReadonlyArray<{ botId: string; chatId: string }>;
  readonly canConsume: boolean;
  readonly canPublish: boolean;
}

export function toPublishingSessionView(
  session: PublishingSession,
): PublishingSessionView {
  return {
    id: session.id,
    name: session.name,
    templateId: session.templateId,
    active: session.active,
    matchingEnabled: session.matchingEnabled,
    publishingEnabled: session.publishingEnabled,
    llmEnabled: session.llmEnabled,
    keywordIds: session.keywordIds,
    sourceToggles: session.sourceToggles,
    telegramTargets: session.telegramTargets,
    threadsTargets: session.threadsTargets,
    canConsume: session.canConsume(),
    canPublish: session.canPublish(),
  };
}

/**
 * Publishing-session CRUD + activation + source toggles
 * (frontend-backed, one tab = one session).
 *
 * `create` may load a content template: the session snapshots the
 * template sources/keywords/targets/switches/prompt scoping at creation
 * time (later template edits do NOT rewrite live sessions — sessions
 * are explicit, templates are starting points).
 */
@Injectable()
export class PublishingSessionUseCases {
  public constructor(
    private readonly sessions: PublishingSessionRepository,
    private readonly templates: ContentTemplateRepository,
  ) {}

  public async create(
    input: CreatePublishingSessionInput,
  ): Promise<PublishingSession> {
    if (input.id !== undefined) {
      const existing = await this.sessions.findById(input.id);
      if (existing !== null) {
        throw new DomainError(
          ErrorCode.CONFLICT,
          `session already exists: ${input.id}`,
        );
      }
    }
    const fromTemplate =
      input.templateId === undefined || input.templateId === null
        ? null
        : await this.templates.findById(input.templateId);
    if (
      input.templateId !== undefined &&
      input.templateId !== null &&
      !fromTemplate
    ) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `unknown template: ${input.templateId}`,
      );
    }
    const session = PublishingSession.create({
      ...input,
      sourceToggles:
        input.sourceToggles ??
        Object.fromEntries(
          (fromTemplate?.sourceIds ?? []).map((id) => [id, true]),
        ),
      keywordIds: input.keywordIds ?? [...(fromTemplate?.keywordIds ?? [])],
      matchingEnabled:
        input.matchingEnabled ?? fromTemplate?.matchingEnabled ?? true,
      llmEnabled: input.llmEnabled ?? fromTemplate?.llmEnabled ?? true,
      publishingEnabled:
        input.publishingEnabled ?? fromTemplate?.publishingEnabled ?? true,
      telegramTargets:
        input.telegramTargets ??
        fromTemplate?.bindingsFor('telegram').map((binding) => ({
          botId: binding.botId,
          chatId: binding.chatId,
        })) ??
        [],
      threadsTargets:
        input.threadsTargets ??
        fromTemplate?.bindingsFor('threads').map((binding) => ({
          botId: binding.botId,
          chatId: binding.chatId,
        })) ??
        [],
    });
    await this.sessions.save(session);
    return session;
  }

  public async get(id: string): Promise<PublishingSession> {
    const found = await this.sessions.findById(id);
    if (!found) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown session: ${id}`);
    }
    return found;
  }

  public async list(): Promise<ReadonlyArray<PublishingSession>> {
    return this.sessions.list();
  }

  public async update(
    id: string,
    patch: Parameters<PublishingSession['updateConfig']>[0],
  ): Promise<PublishingSession> {
    const session = await this.get(id);
    session.updateConfig(patch);
    await this.sessions.save(session);
    return session;
  }

  public async activate(id: string): Promise<PublishingSession> {
    return this.update(id, { active: true });
  }

  public async deactivate(id: string): Promise<PublishingSession> {
    return this.update(id, { active: false });
  }

  public async setSourceToggle(
    id: string,
    sourceId: string,
    enabled: boolean,
  ): Promise<PublishingSession> {
    const session = await this.get(id);
    session.setSourceToggle(sourceId, enabled);
    await this.sessions.save(session);
    return session;
  }

  public async remove(id: string): Promise<void> {
    const removed = await this.sessions.remove(id);
    if (!removed) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown session: ${id}`);
    }
  }
}
