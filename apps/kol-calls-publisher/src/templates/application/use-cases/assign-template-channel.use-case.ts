import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';
import { EncryptionService } from '../../infrastructure/security/encryption.service';
import type { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

/**
 * Assigns a publishing target to a template with admin verification
 * (P23-bis): decrypts the catalog token, calls `getChatMember`, and only
 * stores `admin_verified_at` when the bot is administrator/creator.
 * Fail-closed: a non-admin bot rejects with FORBIDDEN and nothing is stored.
 */
@Injectable()
export class AssignTemplateChannelUseCase {
  public constructor(
    private readonly templates: TemplateRepository,
    private readonly bots: TelegramBotRepository,
    private readonly encryption: EncryptionService,
    private readonly verifier: TelegramAdminVerifierPort,
  ) {}

  public async execute(input: {
    templateId: string;
    botId: string;
    channelTarget: string;
  }): Promise<{ template: PublishingTemplate }> {
    const template = await this.templates.findById(input.templateId);
    if (!template) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `template not found: ${input.templateId}`,
        {
          templateId: input.templateId,
        },
      );
    }
    const bot = await this.bots.findById(input.botId);
    if (!bot) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `telegram bot not found: ${input.botId}`,
        {
          botId: input.botId,
        },
      );
    }
    const botToken = this.encryption.decrypt(bot.encryptedToken);
    const verified = await this.verifier.verifyAdmin({
      botToken,
      channelTarget: input.channelTarget,
    });
    if (!verified) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `bot ${input.botId} is not admin of ${input.channelTarget} (getChatMember check failed)`,
        {
          templateId: input.templateId,
          botId: input.botId,
          channelTarget: input.channelTarget,
        },
      );
    }
    template.assignChannel(bot.id, input.channelTarget);
    template.markChannelVerified(new Date());
    await this.templates.save(template);
    return { template };
  }
}
