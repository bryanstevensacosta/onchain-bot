import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TemplateRepository } from '../../domain/ports/template.repository';
import {
  PublishingTemplate,
  type CreatePublishingTemplateInput,
} from '../../domain/entities/publishing-template.entity';

/**
 * Creates a template (dashboard-only unless a bot is assigned later via
 * `AssignTemplateChannelUseCase` with admin verification, P23-bis).
 */
@Injectable()
export class CreateTemplateUseCase {
  public constructor(private readonly templates: TemplateRepository) {}

  public async execute(input: CreatePublishingTemplateInput): Promise<{
    template: PublishingTemplate;
  }> {
    const template = PublishingTemplate.create(input);
    if (await this.templates.findById(template.id)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `template already exists: ${template.id}`,
        {
          templateId: template.id,
        },
      );
    }
    await this.templates.save(template);
    return { template };
  }
}
