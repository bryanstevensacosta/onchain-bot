import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TemplateBot } from '../../domain/entities/template-bot.entity';
import type { PublishTarget } from '../../domain/template-target';
import { TemplateBotRepository } from '../../domain/ports/template-bot.repository';
import { TemplateEncryptionService } from '../services/template-encryption.service';

export interface TemplateBotView {
  readonly id: string;
  readonly label: string;
  readonly target: PublishTarget;
  readonly token: string;
  readonly defaultChatId: string | null;
  readonly adminVerifiedAt: Date | null;
}

/**
 * Template-bot catalog CRUD (frontend-backed). Tokens enter plaintext
 * over the API and persist ONLY as ciphertext; reads are redacted.
 */
@Injectable()
export class TemplateBotUseCases {
  public constructor(
    private readonly bots: TemplateBotRepository,
    private readonly encryption: TemplateEncryptionService,
  ) {}

  public async create(input: {
    id?: string;
    label: string;
    target: PublishTarget;
    token: string;
    defaultChatId?: string | null;
  }): Promise<TemplateBotView> {
    if (!input.token.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'bot token must not be empty',
      );
    }
    const bot = TemplateBot.create({
      id: input.id,
      label: input.label,
      target: input.target,
      tokenCiphertext: this.encryption.encrypt(input.token),
      defaultChatId: input.defaultChatId ?? null,
    });
    await this.bots.save(bot);
    return bot.toRedacted();
  }

  public async get(id: string): Promise<TemplateBotView> {
    return (await this.require(id)).toRedacted();
  }

  public async list(): Promise<ReadonlyArray<TemplateBotView>> {
    const all = await this.bots.list();
    return all.map((bot) => bot.toRedacted());
  }

  public async markVerified(
    id: string,
    at: Date = new Date(),
  ): Promise<TemplateBotView> {
    const bot = await this.require(id);
    bot.markChannelVerified(at);
    await this.bots.save(bot);
    return bot.toRedacted();
  }

  public async remove(id: string): Promise<void> {
    const removed = await this.bots.remove(id);
    if (!removed) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown bot: ${id}`);
    }
  }

  /** Resolves a catalog token to plaintext for one send (never logged). */
  public async resolveToken(botId: string): Promise<string> {
    const bot = await this.require(botId);
    return this.encryption.decrypt(bot.tokenCiphertext);
  }

  private async require(id: string): Promise<TemplateBot> {
    const found = await this.bots.findById(id);
    if (!found) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown bot: ${id}`);
    }
    return found;
  }
}
