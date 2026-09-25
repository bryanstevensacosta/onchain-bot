import { Module } from '@nestjs/common';

/**
 * MatchingModule - stub (Tramo 2, todo 1; filled in todo 3).
 *
 * Will own FilteredCryptoNewsService + EnqueueMatchingCronScheduler +
 * MatchingConfig (moved from backend): keyword match, AND-groups,
 * blacklist block, content-filter transforms on-read. Must NOT route
 * threads through matching (direct to queue).
 */
@Module({})
export class MatchingModule {}
