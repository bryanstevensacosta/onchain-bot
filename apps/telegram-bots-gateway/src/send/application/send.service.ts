import { Injectable } from '@nestjs/common';
import { VaultService } from '../../vault/application/vault.service';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import { SendDto } from '../api/http/dto/send.dto';
import { PerBotRateLimiterService } from './per-bot-rate-limiter.service';
import { BotApiClient } from '../infrastructure/bot-api-client';
import {
  InMemoryIdempotencyStore,
  type SendResultRecord,
} from './idempotency.store';
import { SendAccountingService } from './send-accounting.service';

export interface SendResult extends SendResultRecord {
  readonly cached: boolean;
}

/**
 * Send gateway orchestration (todo 2): idempotency -> vault lookup ->
 * global per-bot quota -> Bot API (centralized 429 backoff) -> account.
 *
 * No product policy here: the gateway paces ONLY for Telegram quotas
 * (30/s per bot, ~1/s per chat). Delays/caps stay in the calling apps.
 */
@Injectable()
export class SendService {
  public constructor(
    private readonly vault: VaultService,
    private readonly limiter: PerBotRateLimiterService,
    private readonly botApi: BotApiClient,
    private readonly idempotency: InMemoryIdempotencyStore,
    private readonly accounting: SendAccountingService,
  ) {}

  public async send(
    botId: string,
    dto: SendDto,
    caller?: string,
  ): Promise<SendResult> {
    void caller;
    if (dto.client_msg_id) {
      const hit = this.idempotency.get(botId, dto.chat_id, dto.client_msg_id);
      if (hit) return { ...hit, cached: true };
    }
    await this.vault.get(botId);
    const { method, payload } = SendService.toBotApi(dto);
    const { waitedMs } = await this.limiter.acquire(botId, dto.chat_id);
    if (waitedMs > 0) this.accounting.markQuotaWait(botId, waitedMs);
    const token = await this.vault.decryptToken(botId);
    const { result, attempts } = await this.botApi.post(
      botId,
      token,
      method,
      payload,
    );
    this.accounting.markSent(botId);
    const out: SendResult = {
      ok: true,
      message_id: SendService.extractMessageId(method, result),
      attempts,
      cached: false,
    };
    if (dto.client_msg_id) {
      this.idempotency.set(botId, dto.chat_id, dto.client_msg_id, out);
    }
    return out;
  }

  public async stats(botId: string): Promise<
    ReturnType<SendAccountingService['snapshot']> & {
      readonly botId: string;
      readonly quota: { perBotPerSecond: number; perChatPerSecond: number };
    }
  > {
    await this.vault.get(botId);
    return {
      botId,
      ...this.accounting.snapshot(botId),
      quota: { perBotPerSecond: 30, perChatPerSecond: 1 },
    };
  }

  private static toBotApi(dto: SendDto): {
    method: string;
    payload: Record<string, unknown>;
  } {
    const common: Record<string, unknown> = { chat_id: dto.chat_id };
    if (dto.disable_notification !== undefined) {
      common.disable_notification = dto.disable_notification;
    }
    if (dto.kind === 'message') {
      return {
        method: 'sendMessage',
        payload: {
          ...common,
          text: dto.text,
          ...(dto.parse_mode ? { parse_mode: dto.parse_mode } : {}),
        },
      };
    }
    if (dto.kind === 'photo') {
      return {
        method: 'sendPhoto',
        payload: {
          ...common,
          photo: dto.photo,
          ...(dto.caption ? { caption: dto.caption } : {}),
          ...(dto.parse_mode ? { parse_mode: dto.parse_mode } : {}),
        },
      };
    }
    const media = dto.media ?? [];
    for (const item of media) {
      if (typeof item?.type !== 'string' || typeof item?.media !== 'string') {
        throw new DomainError(
          ErrorCode.VALIDATION,
          'media_group items need { type, media }',
        );
      }
    }
    return { method: 'sendMediaGroup', payload: { ...common, media } };
  }

  private static extractMessageId(method: string, result: unknown): number {
    const first = Array.isArray(result) ? result[0] : result;
    const messageId = (first as { message_id?: unknown } | null)?.message_id;
    if (typeof messageId !== 'number') {
      throw new DomainError(
        ErrorCode.UPSTREAM,
        `Bot API ${method} returned no message_id`,
      );
    }
    return messageId;
  }
}
