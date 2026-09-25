import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  PublishingContentTemplate,
  type CreateContentTemplateInput,
} from '../../domain/entities/publishing-template.entity';
import { ContentTemplateRepository } from '../../domain/ports/content-template.repository';

export interface ContentTemplateView {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly sourceIds: ReadonlyArray<string>;
  readonly keywordIds: ReadonlyArray<string>;
  readonly promptTemplateId: string | null;
  readonly targets: ReadonlyArray<string>;
  readonly botBindings: ReadonlyArray<{
    readonly botId: string;
    readonly target: string;
    readonly chatId: string;
  }>;
  readonly matchingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly scheduleMode: string;
  readonly canPublish: boolean;
}

export function toContentTemplateView(
  template: PublishingContentTemplate,
): ContentTemplateView {
  return {
    id: template.id,
    name: template.name,
    active: template.active,
    sourceIds: template.sourceIds,
    keywordIds: template.keywordIds,
    promptTemplateId: template.promptTemplateId,
    targets: template.targets,
    botBindings: template.botBindings,
    matchingEnabled: template.matchingEnabled,
    llmEnabled: template.llmEnabled,
    publishingEnabled: template.publishingEnabled,
    scheduleMode: template.schedule.mode,
    canPublish: template.canPublish(),
  };
}

/**
 * Content-template CRUD + activation (frontend-backed).
 */
@Injectable()
export class ContentTemplateUseCases {
  public constructor(private readonly templates: ContentTemplateRepository) {}

  public async create(
    input: CreateContentTemplateInput,
  ): Promise<PublishingContentTemplate> {
    const existing =
      input.id === undefined ? null : await this.templates.findById(input.id);
    if (existing !== null) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `template already exists: ${input.id}`,
      );
    }
    const template = PublishingContentTemplate.create(input);
    await this.templates.save(template);
    return template;
  }

  public async get(id: string): Promise<PublishingContentTemplate> {
    const found = await this.templates.findById(id);
    if (!found) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown template: ${id}`);
    }
    return found;
  }

  public async list(): Promise<ReadonlyArray<PublishingContentTemplate>> {
    return this.templates.list();
  }

  public async update(
    id: string,
    patch: Parameters<PublishingContentTemplate['updateConfig']>[0],
  ): Promise<PublishingContentTemplate> {
    const template = await this.get(id);
    template.updateConfig(patch);
    await this.templates.save(template);
    return template;
  }

  public async activate(id: string): Promise<PublishingContentTemplate> {
    return this.update(id, { active: true });
  }

  public async deactivate(id: string): Promise<PublishingContentTemplate> {
    return this.update(id, { active: false });
  }

  public async remove(id: string): Promise<void> {
    const removed = await this.templates.remove(id);
    if (!removed) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown template: ${id}`);
    }
  }
}
