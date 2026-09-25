import { Module } from '@nestjs/common';

/**
 * FiltersModule - stub (Tramo 2, todo 1; filled in todo 3).
 *
 * Will own ContentFilterService (ReDoS-safe regex transforms, moved
 * from backend ingestion/crypto-news/): per-channel rules applied
 * on-read, never persisted.
 */
@Module({})
export class FiltersModule {}
