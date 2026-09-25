import { Module } from '@nestjs/common';

/**
 * TelegramModule - stub (Tramo 2, todo 1; filled in todo 7).
 *
 * Will own crypto-news-bot-api.adapter (moved
 * BotApiCryptoNewsPublisherAdapter) + threads-bot-api.adapter (new,
 * THREADS_BOT_TOKEN) + TelegramPublisherPort with routing by
 * contentType and per-bot rate limits. Second C-SHARED-01/C2 move
 * (first was the kol-system kol bot move). P10: no legacy publisher, no kol bot here.
 */
@Module({})
export class TelegramModule {}
