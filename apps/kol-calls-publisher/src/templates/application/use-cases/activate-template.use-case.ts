import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TemplateRepository } from '../../domain/ports/template.repository';
import type { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

/**
 * Activates / deactivates a template (orchestrator only processes active).
 */
@Injectable()
export class ActivateTemplateUseCase {
  public constructor(private readonly templates: TemplateRepository) {}

  public async execute(input: { id: string; active: boolean }): Promise<{
    template: PublishingTemplate;
  }> {
    const template = await this.templates.findById(input.id);
    if (!template) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `template not found: ${input.id}`,
        {
          templateId: input.id,
        },
      );
    }
    if (input.active) template.activate();
    else template.deactivate();
    await this.templates.save(template);
    return { template };
  }
}
