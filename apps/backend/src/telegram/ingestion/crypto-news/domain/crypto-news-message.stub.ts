/**
 * @deprecated STUB TYPE - Backend no longer uses crypto-news entities
 *
 * Minimal stub type to satisfy DI shim repository signatures.
 *
 * Post crypto-news-entity-cleanup (2026-09-08):
 * - Backend uses DTOs only (EnqueueMessageDto)
 * - This stub exists ONLY for repository port signatures (DI compatibility)
 * - Never instantiated (in-memory repo returns null always)
 *
 * DO NOT USE. Import EnqueueMessageDto from crypto-news-publisher instead.
 */
export type CryptoNewsMessage = {
  id: string;
  channelId: string;
  messageId: number;
  content: string;
  publishedAt: Date;
  ingestedAt: Date;
  media: unknown[];
};
