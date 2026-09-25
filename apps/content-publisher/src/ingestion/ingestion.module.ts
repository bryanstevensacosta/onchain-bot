import { Module } from '@nestjs/common';

/**
 * IngestionModule - stub (Tramo 2, todo 1; filled in todo 2).
 *
 * Will own CryptoNewsIngestionClient + ProcessCryptoNewsMessageHandler
 * (moved from backend crypto-news-integration/): SSE listener filtered
 * to messageType==='crypto-news' (C-SSE-01) + polling fallback, x-api-key
 * (INGESTION_TELEGRAM_API_KEY) from day one. P10: subscribing to 'kol'
 * is PROHIBITED in this app.
 */
@Module({})
export class IngestionModule {}
