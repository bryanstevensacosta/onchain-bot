import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { ScoredCallRepository } from '../../../scoring/application/ports/scored-call.repository';
import { TemplateRepository } from '../../domain/ports/template.repository';
import type { RankingStrategy } from '../../domain/entities/publishing-template.entity';
import {
  RankingEngine,
  type RankedCall,
} from '../services/ranking-engine.service';

/**
 * Returns the ranked calls for a template dashboard (P6 + P16 + P17 input).
 */
@Injectable()
export class GetTemplateRankingsUseCase {
  public constructor(
    private readonly templates: TemplateRepository,
    private readonly scored: ScoredCallRepository,
    private readonly ranking: RankingEngine,
  ) {}

  public async execute(input: {
    templateId: string;
    strategy?: RankingStrategy;
    limit?: number;
  }): Promise<{
    templateId: string;
    strategy: RankingStrategy;
    ranked: RankedCall[];
  }> {
    const template = await this.templates.findById(input.templateId);
    if (!template) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `template not found: ${input.templateId}`,
        {
          templateId: input.templateId,
        },
      );
    }
    const strategy = input.strategy ?? template.rankingStrategy;
    const recent = await this.scored.findRecent(100);
    const inScope = recent.filter(
      (call) =>
        template.classification.isSourceVisible(call.kolId) &&
        template.classification.isScoreVisible(call.score),
    );
    const ranked = this.ranking.rank(
      inScope.map((call) => ({
        mentionId: call.mentionId,
        kolId: call.kolId,
        score: call.score,
        views: null,
        reactions: null,
        scoredAt: call.scoredAt,
      })),
      strategy,
      {
        weights: template.weights,
        limit: input.limit ?? template.rankingLimit,
      },
    );
    return { templateId: template.id, strategy, ranked };
  }
}
