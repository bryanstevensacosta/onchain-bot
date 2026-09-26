import { ScoredCall } from '../../../scoring/domain/entities/scored-call.entity';
import { Score } from '../../../scoring/domain/value-objects/score.vo';
import { InMemoryScoredCallRepository } from '../../../scoring/infrastructure/repositories/in-memory-scored-call.repository';
import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { RankingEngine } from '../services/ranking-engine.service';
import { GetTemplateRankingsUseCase } from './get-template-rankings.use-case';

function scored(mentionId: string, score: number, kolId = 'kol-1'): ScoredCall {
  return ScoredCall.create({
    mentionId,
    kolId,
    messageId: 1,
    contractIndex: 0,
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    score: Score.fromNumber(score),
    avgKolReputation: 0.5,
    breakdown: [],
    scoredAt: new Date('2026-09-25T00:00:00Z'),
  });
}

describe('GetTemplateRankingsUseCase (todo 10, failing-first)', () => {
  async function setup() {
    const templates = new InMemoryTemplateRepository();
    const scoredRepo = new InMemoryScoredCallRepository();
    await scoredRepo.save(scored('m-low', 10));
    await scoredRepo.save(scored('m-high', 90, 'kol-2'));
    return {
      templates,
      useCase: new GetTemplateRankingsUseCase(
        templates,
        scoredRepo,
        new RankingEngine(),
      ),
    };
  }

  it('ranks passing mentions with the template strategy', async () => {
    const { templates, useCase } = await setup();
    await templates.save(
      PublishingTemplate.create({ id: 't', name: 't', minVisibleScore: 50 }),
    );
    const { ranked, strategy } = await useCase.execute({ templateId: 't' });
    expect(strategy).toBe('score');
    expect(ranked.map((r) => r.mentionId)).toEqual(['m-high']);
  });

  it('honors strategy override + limit', async () => {
    const { templates, useCase } = await setup();
    await templates.save(PublishingTemplate.create({ id: 't', name: 't' }));
    const { ranked } = await useCase.execute({
      templateId: 't',
      strategy: 'recency',
      limit: 1,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].strategy).toBe('recency');
  });

  it('returns NOT_FOUND for missing templates', async () => {
    const { useCase } = await setup();
    await expect(useCase.execute({ templateId: 'nope' })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
  });
});
