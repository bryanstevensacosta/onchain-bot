/**
 * CryptoNewsMessageDto - Data Transfer Object for crypto-news messages
 *
 * Consumed from ingestion-service HTTP API (GET /api/crypto-news/messages).
 * Replaces legacy domain entity CryptoNewsMessage from telegram/ingestion/crypto-news/domain.
 *
 * **Architecture (Opción A):**
 * - Ingestion-service: OWNS data (TypeORM entities + DB)
 * - Backend: CONSUMES via HTTP (DTOs only, no domain entities)
 *
 * **Per db-separation plan (2026-09-08):**
 * Backend owns ZERO crypto-news tables. All reads via HTTP API.
 */
export interface CryptoNewsMediaDto {
  readonly type: 'photo' | 'video';
  readonly index: number;
  readonly url: string;
  readonly mimeType: string;
  readonly fileSize: number;
}

export interface CryptoNewsMessageDto {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string; // ISO date from HTTP
  readonly ingestedAt: string; // ISO date from HTTP
  readonly media: ReadonlyArray<CryptoNewsMediaDto>;
  readonly linkPreviewUrl: string | null;
  readonly linkPreviewTitle: string | null;
  readonly linkPreviewDescription: string | null;
  readonly linkPreviewSiteName: string | null;
  readonly messageEntities: string | null; // JSON string from DB
  readonly groupedId: string | null;
}
