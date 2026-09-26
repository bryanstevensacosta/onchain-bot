import { Injectable } from '@nestjs/common';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import {
  TelegramBot,
  type RedactedTelegramBot,
} from '../../domain/entities/telegram-bot.entity';
import { EncryptionService } from '../../infrastructure/security/encryption.service';

/**
 * Registers a bot in the reusable catalog (P23): encrypts the token BEFORE
 * persisting — plaintext never touches the repository.
 */
@Injectable()
export class CreateTelegramBotUseCase {
  public constructor(
    private readonly bots: TelegramBotRepository,
    private readonly encryption: EncryptionService,
  ) {}

  public async execute(input: { label: string; token: string }): Promise<{
    bot: RedactedTelegramBot;
  }> {
    const bot = TelegramBot.create({
      label: input.label,
      encryptedToken: this.encryption.encrypt(input.token),
    });
    await this.bots.save(bot);
    return { bot: bot.toRedacted() };
  }
}
