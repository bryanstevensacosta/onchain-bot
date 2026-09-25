import { ConfigService } from '@nestjs/config';
import { ScoredCall } from '../../../scoring/domain/entities/scored-call.entity';
import { Score } from '../../../scoring/domain/value-objects/score.vo';
import { InMemoryScoredCallRepository } from '../../../scoring/infrastructure/repositories/in-memory-scored-call.repository';
import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { InMemoryTelegramBotRepository } from '../../infrastructure/repositories/in-memory-telegram-bot.repository';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { TelegramBot } from '../../domain/entities/telegram-bot.entity';
import { RankingEngine } from './ranking-engine.service';
import { TemplateOrchestratorService } from './template-orchestrator.service';

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

describe('TemplateOrchestratorService cron 1min (todo 10, failing-first)', () => {
  async function setup() {
    const templates = new InMemoryTemplateRepository();
    const bots = new InMemoryTelegramBotRepository();
    const scoredRepo = new InMemoryScoredCallRepository();
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new TemplateOrchestratorService(
      templates,
      bots,
      scoredRepo,
      new RankingEngine(),
      config,
    );
    await scoredRepo.save(scored('m-low', 10));
    await scoredRepo.save(scored('m-high', 90, 'kol-2'));
    return { templates, bots, service };
  }

  it('processes only active templates, applying source + score filters', async () => {
    const { templates, service } = await setup();
    await templates.save(PublishingTemplate.create({ id: 'on', name: 'on' }));
    await templates.save(
      PublishingTemplate.create({ id: 'off', name: 'off', active: false }),
    );
    await templates.save(
      PublishingTemplate.create({
        id: 'narrow',
        name: 'narrow',
        kolSourceIds: ['kol-2'],
      }),
    );
    const results = await service.processAllTemplates();
    expect(results.map((r) => r.templateId).sort()).toEqual(['narrow', 'on']);
    expect(results.find((r) => r.templateId === 'on')?.ranked).toHaveLength(2);
    expect(results.find((r) => r.templateId === 'narrow')?.ranked).toHaveLength(
      1,
    );
  });

  it('missing token means dashboard-only (no throw, rest continues)', async () => {
    const { templates, service } = await setup();
    await templates.save(
      PublishingTemplate.create({ id: 'dash', name: 'dash' }),
    );
    const bot = TelegramBot.create({ label: 'b', encryptedToken: 'ct' });
    await templates.save(
      PublishingTemplate.create({ id: 'pub', name: 'pub', minVisibleScore: 0 }),
    );
    const pub = (await templates.findById('pub'))!;
    pub.assignChannel(bot.id, '@chan');
    pub.markChannelVerified(new Date());
    await templates.save(pub);
    const results = await service.processAllTemplates();
    const dash = results.find((r) => r.templateId === 'dash')!;
    expect(dash.publishingEnabled).toBe(false);
    expect(dash.skippedPublishingReason).toMatch(/dashboard-only/);
    // bot id unknown to the catalog -> still dashboard-only, pipeline continues
    const missing = results.find((r) => r.templateId === 'pub')!;
    expect(missing.publishingEnabled).toBe(false);
    expect(results).toHaveLength(2);
  });

  it('verified channel enables publishing for that template', async () => {
    const { templates, bots, service } = await setup();
    const bot = TelegramBot.create({
      id: 'bot-1',
      label: 'b',
      encryptedToken: 'ct',
    });
    await bots.save(bot);
    const template = PublishingTemplate.create({ id: 'pub', name: 'pub' });
    template.assignChannel('bot-1', '@chan');
    template.markChannelVerified(new Date());
    await templates.save(template);
    const [result] = await service.processAllTemplates();
    expect(result.publishingEnabled).toBe(true);
    expect(result.skippedPublishingReason).toBeUndefined();
  });

  it('handleCron skips when TEMPLATE_ORCHESTRATOR_ENABLED is not true', async () => {
    const { templates, service } = await setup();
    await templates.save(PublishingTemplate.create({ id: 'on', name: 'on' }));
    await service.handleCron();
    // no throw; enabled path is covered by processAllTemplates
    expect(await templates.count()).toBe(1);
  });
});
