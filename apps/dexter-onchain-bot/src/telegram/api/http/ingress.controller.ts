import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { DexterBotConfigService } from '../../../settings/infrastructure/config/bot.config';
import { CommandRouterService } from '../../../commands/application/router/command-router.service';
import type { TelegramUpdate } from '../../domain/ports/telegram.port';

/**
 * Gateway fan-out ingress (telegram-bots-gateway todo 6).
 *
 * `POST /dexter/ingress` (201) is the subscriber target for the
 * telegram-bots-gateway update router (`UpdateFanoutService`): the
 * gateway POSTs the raw Telegram update byte-identical with an
 * `x-gateway-bot` marker. The shared secret (`DEXTER_INGRESS_SECRET`,
 * timing-safe compare) authenticates the fan-out; unset means accept
 * with a warn (dev only — same unsigned-dev rule as the webhook).
 * Dispatch errors are acked (201) without rethrow — the gateway owns
 * retries + dead-letter, never a retry storm here. Lookup/scan/commands
 * are untouched: updates land in the same `CommandRouterService` as the
 * direct webhook and polling paths.
 */
@Controller('dexter')
export class DexterIngressController {
  private readonly logger = new Logger(DexterIngressController.name);

  public constructor(
    private readonly config: DexterBotConfigService,
    private readonly router: CommandRouterService,
  ) {}

  @Post('ingress')
  @HttpCode(HttpStatus.CREATED)
  public async handle(
    @Body() body: TelegramUpdate,
    @Headers('x-gateway-bot') gatewayBot?: string,
    @Headers('x-gateway-secret') gatewaySecret?: string,
  ): Promise<{ ok: true }> {
    if (!gatewayBot || gatewayBot.length === 0) {
      throw new ForbiddenException('Missing gateway marker');
    }
    const expected = this.config.get().ingressSecret;
    if (expected && expected.length > 0) {
      const presented = Buffer.from(gatewaySecret ?? '');
      const wanted = Buffer.from(expected);
      if (
        presented.length !== wanted.length ||
        !timingSafeEqual(presented, wanted)
      ) {
        this.logger.warn('Ingress rejected: invalid gateway secret');
        throw new ForbiddenException('Invalid gateway secret');
      }
    } else {
      this.logger.warn(
        'Ingress accepted unsigned (DEXTER_INGRESS_SECRET empty — dev only)',
      );
    }

    try {
      await this.router.dispatch(body);
    } catch (err) {
      this.logger.error(
        `Ingress dispatch error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    return { ok: true };
  }
}
