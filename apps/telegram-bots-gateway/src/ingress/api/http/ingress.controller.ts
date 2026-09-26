import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { RequireScope } from '../../../auth/api/http/require-scope.decorator';
import { SubscriptionRegistryService } from '../../application/subscription-registry.service';
import { IngressModeService } from '../../application/ingress-mode.service';
import { UpdateFanoutService } from '../../application/update-fanout.service';
import { UpdatePollerService } from '../../application/update-poller.service';
import { DeadLetterStore } from '../../application/dead-letter.store';
import { SetModeDto, UpsertRouteDto } from './dto/ingress.dto';

/**
 * Single webhook ingress + update router (todo 3).
 *
 * - `POST /api/ingress/:botId/updates` is PUBLIC to Telegram (auth is
 *   the per-route `x-telegram-bot-api-secret-token`, timing-safe
 *   compared — same header Bot API `setWebhook` sends). While the
 *   route is in polling mode delivery is refused with 409: webhook
 *   and getUpdates never run together per bot.
 * - Route management (`subscriptions`, `mode`, `dead-letter` reads)
 *   requires the `admin` scope (service HMAC auth).
 * - Bodies are pass-through: the raw update is fanned out
 *   byte-identical to subscribed apps (kol-system, feed-publisher,
 *   dexter). No business logic here.
 */
@Controller('api/ingress')
export class IngressController {
  public constructor(
    private readonly registry: SubscriptionRegistryService,
    private readonly modes: IngressModeService,
    private readonly fanout: UpdateFanoutService,
    private readonly poller: UpdatePollerService,
    private readonly deadLetters: DeadLetterStore,
  ) {}

  @Post(':botId/updates')
  @HttpCode(201)
  public async receiveUpdate(
    @Param('botId') botId: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
    @Body() update: unknown,
  ) {
    const route = this.registry.get(botId);
    if (!route) {
      throw new UnauthorizedException('unknown bot route');
    }
    if (!isSecretEqual(secretToken, route.webhookSecret)) {
      throw new UnauthorizedException('invalid webhook secret');
    }
    this.modes.assertWebhookActive(botId);
    const result = await this.fanout.fanout(botId, update ?? {});
    return { ok: true, ...result };
  }

  @Put(':botId/subscriptions')
  @RequireScope('admin')
  public upsertRoute(
    @Param('botId') botId: string,
    @Body() dto: UpsertRouteDto,
  ) {
    const route = this.registry.registerBot(botId, dto.webhookSecret);
    for (const sub of dto.subscribers ?? []) {
      this.registry.subscribe(botId, {
        appId: sub.appId,
        url: sub.url,
        secret: sub.secret,
      });
    }
    return this.describe(botId, route.mode);
  }

  @Get(':botId/subscriptions')
  @RequireScope('admin')
  public getRoute(@Param('botId') botId: string) {
    const route = this.registry.get(botId);
    if (!route) return { botId, registered: false };
    return this.describe(botId, route.mode);
  }

  @Delete(':botId/subscriptions/:appId')
  @RequireScope('admin')
  public removeSubscriber(
    @Param('botId') botId: string,
    @Param('appId') appId: string,
  ) {
    const route = this.registry.unsubscribe(botId, appId);
    return this.describe(botId, route.mode);
  }

  @Post(':botId/mode')
  @RequireScope('admin')
  @HttpCode(201)
  public setMode(@Param('botId') botId: string, @Body() dto: SetModeDto) {
    if (dto.mode === 'polling') {
      this.modes.enablePolling(botId);
      return this.describe(botId, 'polling');
    }
    this.poller.stop(botId);
    this.modes.enableWebhook(botId);
    return this.describe(botId, 'webhook');
  }

  @Post(':botId/poller/start')
  @RequireScope('admin')
  @HttpCode(201)
  public async startPoller(@Param('botId') botId: string) {
    await this.poller.start(botId);
    return { botId, polling: true };
  }

  @Post(':botId/poller/stop')
  @RequireScope('admin')
  @HttpCode(201)
  public stopPoller(@Param('botId') botId: string) {
    this.poller.stop(botId);
    return { botId, polling: false };
  }

  @Get(':botId/dead-letter')
  @RequireScope('admin')
  public deadLetter(@Param('botId') botId: string) {
    const records = this.deadLetters.list(botId);
    return { botId, total: records.length, records };
  }

  private describe(botId: string, mode: 'webhook' | 'polling') {
    const route = this.registry.get(botId);
    return {
      botId,
      registered: true,
      mode,
      polling: this.poller.isPolling(botId),
      subscribers: (route?.subscribers ?? []).map((s) => ({
        appId: s.appId,
        url: s.url,
        hasSecret: Boolean(s.secret),
      })),
    };
  }
}

function isSecretEqual(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
