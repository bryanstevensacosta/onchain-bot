import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';
import type { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

/**
 * Replaces the template source selector (P16 single dashboard).
 * Same feed validation as `UpdateTemplateUseCase`.
 */
@Injectable()
export class SetTemplateSourcesUseCase {
  public constructor(
    private readonly templates: TemplateRepository,
    private readonly sources: SourceValidatorPort,
  ) {}

  public async execute(input: {
    id: string;
    kolSourceIds: ReadonlyArray<string>;
  }): Promise<{
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
    const { unknownIds } = await this.sources.validateSources(
      input.kolSourceIds,
    );
    if (unknownIds.length > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `unknown KOL source ids: ${unknownIds.join(', ')}`,
        { templateId: input.id, unknownIds: [...unknownIds] },
      );
    }
    template.setSources(input.kolSourceIds);
    await this.templates.save(template);
    return { template };
  }
}
