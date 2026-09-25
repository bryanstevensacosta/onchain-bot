import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import { TelegramBotRepository } from '../../../templates/domain/ports/telegram-bot.repository';
import { EncryptionService } from '../../../templates/infrastructure/security/encryption.service';

/**
 * Catalog token resolver (P23): decrypts the `telegram_bots` ciphertext
 * for `botId`. Unknown bot → UNAUTHORIZED (401, no post attempted);
 * tampered ciphertext → VALIDATION from `EncryptionService` (fail-closed).
 */
@Injectable()
export class BotTokenResolverAdapter extends BotTokenResolverPort {
  public constructor(
    private readonly bots: TelegramBotRepository,
    private readonly encryption: EncryptionService,
  ) {
    super();
  }

  public async resolveBotToken(botId: string): Promise<string> {
    const bot = await this.bots.findById(botId);
    if (!bot) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        `bot not configured: ${botId} (dashboard-only, no post attempted)`,
        { botId },
      );
    }
    return this.encryption.decrypt(bot.encryptedToken);
  }
}
