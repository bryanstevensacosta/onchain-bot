import { Module } from '@nestjs/common';

/**
 * QueueModule - stub (Tramo 2, todo 1; filled in todo 4).
 *
 * Will own PublisherQueueEntry + EnqueueMatchingMessage +
 * ProcessNextQueuedArticle (core) + schedulers (1min + TTL 24h) with
 * the unified contentType discriminator (moved from backend
 * crypto-news-publisher/).
 */
@Module({})
export class QueueModule {}
