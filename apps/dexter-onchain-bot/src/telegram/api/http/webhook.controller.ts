import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DexterBotConfigService } from '../../../settings/infrastructure/config/bot.config';
import { CommandRouterService } from '../../../commands/application/router/command-router.service';
import { UserRateLimiter } from '../../../commands/application/rate-limit/user-rate-limiter';
import type { TelegramUpdate } from '../../domain/ports/telegram.port';

/**
 * Webhook controller (moved from backend chain-dexter-bot
 * `infrastructure/telegram/webhook.controller.ts`).
 *
 * Lookup-only ingress: per-chat drop-guard (inherited) PLUS per-user
 * sliding-window rate limit (P13). Over-budget updates are acked without
 * dispatch — never published anywhere.
 */
@Controller('dexter')
export class DexterWebhookController {
  private readonly logger = new Logger(DexterWebhookController.name);
  private readonly rateLimiter: UserRateLimiter;

  public constructor(
    private readonly config: DexterBotConfigService,
    private readonly router: CommandRouterService,
  ) {
    const cfg = this.config.get();
    this.rateLimiter = new UserRateLimiter(cfg.commandRateLimitPerUser);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  public async handle(
    @Req() req: Request,
    @Body() body: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: true }> {
    void req;
    const expected = this.config.get().webhookSecret;
    if (expected && expected.length > 0) {
      if (!secretToken || secretToken !== expected) {
        this.logger.warn('Webhook rejected: invalid or missing secret token');
        throw new ForbiddenException('Invalid secret token');
      }
    }

    const userId =
      body.message?.from?.id ?? body.edited_message?.from?.id ?? null;
    if (userId !== null && !this.rateLimiter.isAllowed(userId)) {
      this.logger.warn(`Webhook rate-limited for user ${userId}`);
      return { ok: true };
    }

    try {
      await this.router.dispatch(body);
    } catch (err) {
      this.logger.error(
        `Webhook dispatch error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    return { ok: true };
  }

  @Post('health')
  @HttpCode(HttpStatus.OK)
  public health(): { status: string; ingestMode: string } {
    return {
      status: 'ok',
      ingestMode: this.config.get().ingestMode,
    };
  }
}
