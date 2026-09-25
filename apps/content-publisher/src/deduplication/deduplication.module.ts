import { Module } from '@nestjs/common';

/**
 * DeduplicationModule - stub (Tramo 2, todo 1; filled in todo 4).
 *
 * Will own DeduplicationService: exact -> content -> semantic cascade
 * (fail-open) + embeddings (storage decision: table default, pgvector
 * veto; moved from backend shared/deduplication/).
 */
@Module({})
export class DeduplicationModule {}
