import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import type { RedactedTelegramBot } from '../../domain/entities/telegram-bot.entity';
import { EncryptionService } from '../../infrastructure/security/encryption.service';

/**
 * Renames a bot and/or rotates its token (re-encrypted before persisting).
 */
@Injectable()
export class UpdateTelegramBotUseCase {
  public constructor(
    private readonly bots: TelegramBotRepository,
    private readonly encryption: EncryptionService,
  ) {}

  public async execute(input: {
    id: string;
    label?: string;
    token?: string;
  }): Promise<{
    bot: RedactedTelegramBot;
  }> {
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
    if (input.label !== undefined) bot.rename(input.label);
    if (input.token !== undefined)
      bot.rotateToken(this.encryption.encrypt(input.token));
    await this.bots.save(bot);
    return { bot: bot.toRedacted() };
  }
}

/**
 * Removes a catalog entry. Templates pointing at it degrade to
 * dashboard-only (orchestrator fail-open per template).
 */
@Injectable()
export class DeleteTelegramBotUseCase {
  public constructor(private readonly bots: TelegramBotRepository) {}

  public async execute(input: {
    id: string;
  }): Promise<{ id: string; deleted: boolean }> {
    const removed = await this.bots.remove(input.id);
    if (!removed) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `telegram bot not found: ${input.id}`,
        {
          botId: input.id,
        },
      );
    }
    return { id: input.id, deleted: true };
  }
}
