import { Injectable } from '@nestjs/common';

export interface SendResultRecord {
  readonly ok: true;
  readonly message_id: number;
  readonly attempts: number;
  readonly cached: boolean;
}

/**
 * Idempotency store keyed by (bot, chat, client_msg_id) (todo 2).
 * In-memory today (single-process pacing is exact here); a shared
 * store lands with multi-replica deploy (todo 7).
 */
@Injectable()
export class InMemoryIdempotencyStore {
  private readonly rows = new Map<string, SendResultRecord>();

  public static key(botId: string, chatId: string, clientMsgId: string): string {
    return `${botId}\n${chatId}\n${clientMsgId}`;
  }

  public get(
    botId: string,
    chatId: string,
    clientMsgId: string,
  ): SendResultRecord | undefined {
    return this.rows.get(InMemoryIdempotencyStore.key(botId, chatId, clientMsgId));
  }

  public set(
    botId: string,
    chatId: string,
    clientMsgId: string,
    record: SendResultRecord,
  ): void {
    this.rows.set(
      InMemoryIdempotencyStore.key(botId, chatId, clientMsgId),
      record,
    );
  }
}
