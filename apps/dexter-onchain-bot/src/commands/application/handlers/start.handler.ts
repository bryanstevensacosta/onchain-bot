import { Injectable } from '@nestjs/common';
import type {
  CommandHandler,
  CommandContext,
} from '../../domain/ports/command-handler.port';
import { TelegramBotClient } from '../../../telegram/infrastructure/telegram/bot-client';

/**
 * /start — REWRITTEN for dexter-onchain-bot (Tramo 3, todo 9, P13).
 *
 * Lookup-only info + usage: what the bot answers, the commands, and the
 * bare-address / forward shortcuts. Never promises channel publishing,
 * scoring, or tracking (those live in kol-system / feed-publisher).
 */
@Injectable()
export class StartCommandHandler implements CommandHandler {
  public readonly name = 'start';

  public constructor(private readonly bot: TelegramBotClient) {}

  public async handle(_args: string[], context: CommandContext): Promise<void> {
    await this.bot.sendMessage(
      context.chatId,
      `👋 Dexter lookup bot — on-chain token info, nothing else\\.
Soy solo lookup: respondo fichas, nunca publico en canales\\.

Uso:
• /ca \\<contrato\\> — ficha completa (precio, MC, liquidez, holders) \\+ botones
• /x \\<contrato\\> — escaneo completo
• /z \\<contrato\\> — escaneo compacto
• /c \\<contrato\\> \\[tf\\] — enlace al chart
• Pega un contrato sin slash y lo escaneo directo
• Reenvíame cualquier mensaje con un contrato y extraigo el primero
• /tb y /settings — botones de trading y config del chat

Datos vía market-data HTTP\\. Si está caído te lo digo — sin fichas parciales\\.`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}

@Injectable()
export class HelpCommandHandler implements CommandHandler {
  public readonly name = 'help';

  public constructor(private readonly bot: TelegramBotClient) {}

  public async handle(_args: string[], context: CommandContext): Promise<void> {
    await this.bot.sendMessage(
      context.chatId,
      `📚 Dexter lookup — solo consultas, sin publicaciones\\.

• /ca \\<contrato\\> — ficha completa
• /x \\<contrato\\> — escaneo completo
• /z \\<contrato\\> — escaneo compacto
• /c \\<contrato\\> \\[tf\\] — chart link
• /tb — botones de trading • /settings — config del chat
• O pega un contrato pelado (sin slash) o reenvía un mensaje con uno\\.`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}
