import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ScoredCallRepository } from '../../../scoring/application/ports/scored-call.repository';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import type { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { RankingEngine, type RankedCall } from './ranking-engine.service';

export interface TemplateProcessResult {
  readonly templateId: string;
  readonly ranked: ReadonlyArray<RankedCall>;
  readonly publishingEnabled: boolean;
  readonly skippedPublishingReason?: string;
  readonly error?: string;
}

/**
 * Template orchestrator (Tramo 1, todo 10, Ph9 — cron every 1 min).
 *
 * Per active template: recent scored calls (limit 100) → template filters
 * (sources P16 + score display P6) → ranking engine → result. Publishing
 * itself lands in todo 11; this service reports `publishingEnabled` per
 * template instead.
 *
 * Adversarial rule: a missing token (or missing catalog bot, or unverified
 * channel) means dashboard-only for THAT template — `publishingEnabled:
 * false` with a reason — while the rest continue. One template throwing
 * never kills the batch (caught per template, surfaced as `error`).
 */
@Injectable()
export class TemplateOrchestratorService {
  private readonly logger = new Logger(TemplateOrchestratorService.name);

  public constructor(
    private readonly templates: TemplateRepository,
    private readonly bots: TelegramBotRepository,
    private readonly scored: ScoredCallRepository,
    private readonly ranking: RankingEngine,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/1 * * * *')
  public async handleCron(): Promise<void> {
    const enabled =
      this.config.get<string>('TEMPLATE_ORCHESTRATOR_ENABLED') ??
      process.env.TEMPLATE_ORCHESTRATOR_ENABLED;
    if (enabled !== 'true') return;
    await this.processAllTemplates();
  }

  public async processAllTemplates(): Promise<TemplateProcessResult[]> {
    const active = await this.templates.findActive();
    const results: TemplateProcessResult[] = [];
    for (const template of active) {
      try {
        results.push(await this.processTemplate(template));
      } catch (err) {
        this.logger.warn(
          `Skipping template ${template.id}: ${(err as Error).message}`,
        );
        results.push({
          templateId: template.id,
          ranked: [],
          publishingEnabled: false,
          error: (err as Error).message,
        });
      }
    }
    return results;
  }

  private async processTemplate(
    template: PublishingTemplate,
  ): Promise<TemplateProcessResult> {
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
      template.rankingStrategy,
      { weights: template.weights, limit: template.rankingLimit },
    );
    const publishing = await this.resolvePublishing(template);
    return {
      templateId: template.id,
      ranked,
      publishingEnabled: publishing.enabled,
      ...(publishing.enabled
        ? {}
        : { skippedPublishingReason: publishing.reason }),
    };
  }

  private async resolvePublishing(
    template: PublishingTemplate,
  ): Promise<{ enabled: boolean; reason?: string }> {
    if (!template.active)
      return { enabled: false, reason: 'template inactive' };
    if (!template.botId) {
      return { enabled: false, reason: 'dashboard-only (no bot configured)' };
    }
    const bot = await this.bots.findById(template.botId);
    if (!bot) {
      return {
        enabled: false,
        reason: 'dashboard-only (bot missing from catalog)',
      };
    }
    if (!template.channelTarget || !template.adminVerifiedAt) {
      return {
        enabled: false,
        reason: 'dashboard-only (channel not admin-verified)',
      };
    }
    return { enabled: true };
  }
}
