import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import type { RedactedTelegramBot } from '../../domain/entities/telegram-bot.entity';

/**
 * Lists the bot catalog — every entry redacted (`token: '***'`).
 */
@Injectable()
export class ListTelegramBotsUseCase {
  public constructor(private readonly bots: TelegramBotRepository) {}

  public async execute(): Promise<{ bots: RedactedTelegramBot[] }> {
    const all = await this.bots.findAll();
    return { bots: all.map((bot) => bot.toRedacted()) };
  }
}

/**
 * Reads one catalog entry — redacted.
 */
@Injectable()
export class GetTelegramBotUseCase {
  public constructor(private readonly bots: TelegramBotRepository) {}

  public async execute(input: {
    id: string;
  }): Promise<{ bot: RedactedTelegramBot }> {
    const bot = await this.bots.findById(input.id);
    if (!bot) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `telegram bot not found: ${input.id}`,
        {
          botId: input.id,
        },
      );
    }
    return { bot: bot.toRedacted() };
  }
}
