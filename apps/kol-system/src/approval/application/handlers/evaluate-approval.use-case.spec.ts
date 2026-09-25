import { EvaluateApprovalUseCase } from './evaluate-approval.use-case';
import { InMemoryCallApprovalRepository } from '../../infrastructure/repositories/in-memory-call-approval.repository';
import { InMemoryScoredCallRepository } from '../../../scoring/infrastructure/repositories/in-memory-scored-call.repository';
import { InMemoryTemplateRepository } from '../../../templates/infrastructure/repositories/in-memory-template.repository';
import { PublishingTemplate } from '../../../templates/domain/entities/publishing-template.entity';
import { ScoredCall } from '../../../scoring/domain/entities/scored-call.entity';
import { Score } from '../../../scoring/domain/value-objects/score.vo';

function scored(overrides: Partial<{ score: number; kolId: string }> = {}) {
  return ScoredCall.create({
    mentionId: 'solana:ABC:k1:1:0',
    kolId: overrides.kolId ?? 'k1',
    messageId: 1,
    contractIndex: 0,
    chain: 'solana',
    address: 'ABC',
    score: Score.fromNumber(overrides.score ?? 82),
    avgKolReputation: 0.5,
    breakdown: [],
    scoredAt: new Date(),
  });
}

async function setup() {
  const approvals = new InMemoryCallApprovalRepository();
  const scoredRepo = new InMemoryScoredCallRepository();
  const templates = new InMemoryTemplateRepository();
  await templates.save(
    PublishingTemplate.create({ id: 'vip-calls', name: 'vip-calls' }),
  );
  await scoredRepo.save(scored());
  return { approvals, scoredRepo, templates };
}

describe('EvaluateApprovalUseCase (todo 11, failing-first)', () => {
  it('approves a passing mention against the template floor', async () => {
    const { approvals, scoredRepo, templates } = await setup();
    const uc = new EvaluateApprovalUseCase(approvals, scoredRepo, templates);
    const { approval, events } = await uc.execute({
      templateId: 'vip-calls',
      mentionId: 'solana:ABC:k1:1:0',
    });
    expect(approval.status).toBe('approved');
    expect(events.map((e) => e.eventName)).toContain('approval.call.decided');
    expect(await approvals.count()).toBe(1);
  });

  it('rejects below the template minVisibleScore', async () => {
    const { approvals, scoredRepo, templates } = await setup();
    await scoredRepo.save(scored({ score: 10 }));
    await templates.save(
      PublishingTemplate.create({
        id: 'strict',
        name: 'strict',
        minVisibleScore: 70,
      }),
    );
    const uc = new EvaluateApprovalUseCase(approvals, scoredRepo, templates);
    const { approval } = await uc.execute({
      templateId: 'strict',
      mentionId: 'solana:ABC:k1:1:0',
    });
    expect(approval.status).toBe('rejected');
    expect(approval.reason).toBe('SCORE_BELOW_FLOOR');
  });

  it('rejects a source outside the template selector', async () => {
    const { approvals, scoredRepo, templates } = await setup();
    await templates.save(
      PublishingTemplate.create({
        id: 'sel',
        name: 'sel',
        kolSourceIds: ['other'],
      }),
    );
    const uc = new EvaluateApprovalUseCase(approvals, scoredRepo, templates);
    const { approval } = await uc.execute({
      templateId: 'sel',
      mentionId: 'solana:ABC:k1:1:0',
    });
    expect(approval.status).toBe('rejected');
    expect(approval.reason).toBe('SOURCE_NOT_VISIBLE');
  });

  it('rejects when the template is inactive', async () => {
    const { approvals, scoredRepo, templates } = await setup();
    const tpl = PublishingTemplate.create({ id: 'off', name: 'off' });
    tpl.deactivate();
    await templates.save(tpl);
    const uc = new EvaluateApprovalUseCase(approvals, scoredRepo, templates);
    const { approval } = await uc.execute({
      templateId: 'off',
      mentionId: 'solana:ABC:k1:1:0',
    });
    expect(approval.status).toBe('rejected');
    expect(approval.reason).toBe('TEMPLATE_INACTIVE');
  });

  it('throws NOT_FOUND for unknown template or unscored mention', async () => {
    const { approvals, scoredRepo, templates } = await setup();
    const uc = new EvaluateApprovalUseCase(approvals, scoredRepo, templates);
    await expect(
      uc.execute({ templateId: 'nope', mentionId: 'solana:ABC:k1:1:0' }),
    ).rejects.toThrow();
    await expect(
      uc.execute({ templateId: 'vip-calls', mentionId: 'missing' }),
    ).rejects.toThrow();
  });
});
