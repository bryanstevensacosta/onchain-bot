import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';
import type {
  PublishingTemplate,
  RankingStrategy,
  RankingWeights,
} from '../../domain/entities/publishing-template.entity';
import type { ScoringConfigPatch } from '../../../scoring/domain/scoring-config';

export interface UpdateTemplatePatch {
  readonly kolSourceIds?: ReadonlyArray<string>;
  readonly minVisibleScore?: number;
  readonly gemMinScore?: number;
  readonly gemPatterns?: ReadonlyArray<string>;
  readonly rankingStrategy?: RankingStrategy;
  readonly rankingLimit?: number;
  readonly rankingWeights?: RankingWeights;
  readonly scoringConfig?: ScoringConfigPatch;
}

/**
 * Patches template config. When `kolSourceIds` are given they are validated
 * against the ingestion feed (P16) — unknown ids reject with VALIDATION.
 */
@Injectable()
export class UpdateTemplateUseCase {
  public constructor(
    private readonly templates: TemplateRepository,
    private readonly sources: SourceValidatorPort,
  ) {}

  public async execute(input: {
    id: string;
    patch: UpdateTemplatePatch;
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
    if (input.patch.kolSourceIds !== undefined) {
      const { unknownIds } = await this.sources.validateSources(
        input.patch.kolSourceIds,
      );
      if (unknownIds.length > 0) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `unknown KOL source ids: ${unknownIds.join(', ')}`,
          { templateId: input.id, unknownIds: [...unknownIds] },
        );
      }
    }
    template.updateConfig(input.patch);
    await this.templates.save(template);
    return { template };
  }
}
