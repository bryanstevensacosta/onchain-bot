import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { TemplateBot } from '../../../template/domain/entities/template-bot.entity';
import type { PublishTarget } from '../../../template/domain/template-target';
import { TemplateBotRepository } from '../../../template/domain/ports/template-bot.repository';
import type { PublishingSession } from '../../domain/entities/publishing-session.entity';

/**
 * Shared ownership predicate (todo 14, P50): a catalog bot may serve a
 * publish ONLY when it targets the same channel (`target`), an admin
 * verified it (`adminVerifiedAt`), and the requested chat is the
 * admin-verified channel (`defaultChatId`). The cron planner skips
 * violators silently (fail-safe); the explicit publish path throws
 * FORBIDDEN (no existence leak: unknown bots read as foreign).
 */
export function isBotAuthorizedFor(
  bot: TemplateBot,
  target: PublishTarget,
  chatId: string,
): boolean {
  if (bot.target !== target) return false;
  if (bot.adminVerifiedAt === null) return false;
  if (bot.defaultChatId === null) return false;
  return chatId === bot.defaultChatId;
}

/**
 * Ownership-enforced publish authorizer (Tramo 2, todo 14, P50).
 *
 * Publishing requires a session x target binding the session actually
 * owns, served by an admin-verified bot on its verified channel.
 * Every violation is FORBIDDEN (403): cross-session bot reuse, unknown
 * bot ids, unverified bots, target mismatches, and channel hijacks all
 * read identically from the wire.
 */
@Injectable()
export class SessionPublishAuthorizer {
  public constructor(private readonly bots: TemplateBotRepository) {}

  public async authorize(
    session: PublishingSession,
    target: PublishTarget,
    botId: string,
    chatId: string,
  ): Promise<TemplateBot> {
    if (!session.canPublish()) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `session ${session.id} cannot publish (inactive or disabled)`,
      );
    }
    const owned = session
      .targetsFor(target)
      .some((binding) => binding.botId === botId && binding.chatId === chatId);
    if (!owned) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `foreign binding for session ${session.id} on ${target}`,
      );
    }
    const bot = await this.bots.findById(botId);
    if (!bot || !isBotAuthorizedFor(bot, target, chatId)) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `foreign bot for session ${session.id} on ${target}`,
      );
    }
    return bot;
  }
}
