import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';

/**
 * Bot API admin check (P23-bis): `getMe` (resolve the bot user id) then
 * `getChatMember` — verified only for `administrator`/`creator`.
 * Fail-closed: any transport or API error → false (never throws).
 */
@Injectable()
export class HttpTelegramAdminVerifierAdapter extends TelegramAdminVerifierPort {
  private readonly logger = new Logger(HttpTelegramAdminVerifierAdapter.name);

  public async verifyAdmin(input: {
    botToken: string;
    channelTarget: string;
  }): Promise<boolean> {
    try {
      const me = await this.api<{ id: number }>(input.botToken, 'getMe', {});
      if (!me || typeof me.id !== 'number') return false;
      const member = await this.api<{ status: string }>(
        input.botToken,
        'getChatMember',
        {
          chat_id: input.channelTarget,
          user_id: me.id,
        },
      );
      return member?.status === 'administrator' || member?.status === 'creator';
    } catch (err) {
      this.logger.warn(
        `Admin verification failed for ${input.channelTarget}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async api<T>(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { ok?: boolean; result?: T };
      if (!json || json.ok !== true) return null;
      return json.result ?? null;
    } finally {
      clearTimeout(timer);
    }
  }
}
