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
import { ChainDexterBotConfigService } from '../../bot.config';
import { CommandRouterService } from '../../application/handlers/command-router.service';
import type { TelegramUpdate } from './bot-client';

interface RateLimiter {
  isAllowed(chatId: number): boolean;
}

class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<
    number,
    { count: number; windowStart: number }
  >();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  public isAllowed(chatId: number): boolean {
    const now = Date.now();
    const entry = this.hits.get(chatId);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(chatId, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }
}

@Controller('chain-dexter')
export class ChainDexterWebhookController {
  private readonly logger = new Logger(ChainDexterWebhookController.name);
  private readonly rateLimiter: RateLimiter;

  public constructor(
    private readonly config: ChainDexterBotConfigService,
    private readonly router: CommandRouterService,
  ) {
    const cfg = this.config.get();
    this.rateLimiter = new InMemoryRateLimiter(
      cfg.commandRateLimitPerUser,
      60_000,
    );
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  public async handle(
    @Req() req: Request,
    @Body() body: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: true }> {
    const expected = this.config.get().webhookSecret;
    if (expected && expected.length > 0) {
      if (!secretToken || secretToken !== expected) {
        this.logger.warn('Webhook rejected: invalid or missing secret token');
        throw new ForbiddenException('Invalid secret token');
      }
    }

    const chatId = body.message?.chat?.id ?? body.edited_message?.chat?.id;
    if (chatId !== undefined && !this.rateLimiter.isAllowed(chatId)) {
      this.logger.warn(`Webhook rate-limited for chat ${chatId}`);
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
