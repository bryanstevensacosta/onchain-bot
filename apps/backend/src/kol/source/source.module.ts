import { Module } from '@nestjs/common';
import { SourceAggregatorPort } from 'kol/source/application/ports/source-aggregator.port';
import { DefaultSourceAggregator } from 'kol/source/application/handlers/default-source-aggregator';

/**
 * Source BC module (Fase 3 of the kol-refactor plan).
 *
 * Owns:
 * - the `Source` value object (per-KOL attribution of a token mention)
 * - the `SourceType` discriminator (TELEGRAM / DISCORD / OTHER)
 * - the `SourceAggregatorPort` that consumers (token/normalization) use
 *   to dedup mentions into a list of Sources without importing the VO.
 */
@Module({
  providers: [
    {
      provide: SourceAggregatorPort,
      useClass: DefaultSourceAggregator,
    },
  ],
  exports: [SourceAggregatorPort],
})
export class SourceModule {}
