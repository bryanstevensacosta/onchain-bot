import { Injectable } from '@nestjs/common';
import type { CommandHandler, CommandContext } from '../command-handler';
import { TelegramBotClient } from '../../../infrastructure/telegram/bot-client';

@Injectable()
export class StartCommandHandler implements CommandHandler {
  public readonly name = 'start';

  public constructor(private readonly bot: TelegramBotClient) {}

  public async handle(_args: string[], context: CommandContext): Promise<void> {
    await this.bot.sendMessage(
      context.chatId,
      `👋 ¡Hola! Soy *Chain Dexter Bot* — un wrapper Telegram sobre análisis on-chain multi-chain.

Comandos principales:
• /x \\<CA\\> — Escaneo completo (precio, MC, LIQ, holders)
• /z \\<CA\\> — Escaneo compacto
• /c \\<CA\\> \\[tf\\] — Escaneo + chart link
• /tb \\[CODES\\] — Configurar botones de trading (default: DEX, PHO, TRO)
• /settings — Ver configuración del chat

Más comandos próximamente. Tip: en móvil, baja el tamaño de fuente para mejor lectura.`,
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
      `📚 Documentación completa: https://github.com/your-org/onchain-bot

Comandos principales:
/x \\<CA\\> — Escaneo completo
/z \\<CA\\> — Escaneo compacto
/c \\<CA\\> \\[tf\\] — Chart link
/tb \\[CODES\\] — Trade buttons
/settings — Configuración del chat

Para soporte: @MentionLux`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}
