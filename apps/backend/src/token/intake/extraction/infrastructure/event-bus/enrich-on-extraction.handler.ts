/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CandidatesExtractedEvent } from 'token/intake/extraction/domain/events/candidates-extracted.event';
import { EnrichTokenUseCase } from 'token/enrichment/application/handlers/enrich-token.use-case';

/**
 * Subscribes to extraction.candidates.extracted and triggers enrichment
 * for ALL extracted contract addresses immediately after extraction.
 *
 * This ensures snapshots are available even for tokens that will later
 * be rejected by classification/scoring filters. The handler runs
 * asynchronously and never blocks the extraction pipeline.
 */
@Injectable()
export class EnrichOnExtractionHandler {
  private readonly logger = new Logger(EnrichOnExtractionHandler.name);

  public constructor(private readonly enrichToken: EnrichTokenUseCase) {}

  @OnEvent('extraction.candidates.extracted', { async: true })
  public async handle(event: CandidatesExtractedEvent): Promise<void> {
    const { contractAddresses, kolId, messageId } = event.payload;

    if (contractAddresses.length === 0) {
      return;
    }

    this.logger.debug(
      `Enriching ${contractAddresses.length} candidate(s) from ${kolId}:${messageId}`,
    );

    const enrichments = contractAddresses.map(async (candidate) => {
      try {
        const result = await this.enrichToken.execute({
          chain: candidate.chainHint,
          address: candidate.value,
        });
        if (result.errors.length > 0) {
          this.logger.warn(
            `Enrichment completed with errors for ${candidate.value}: ${result.errors.map((e) => e.provider).join(', ')}`,
          );
        } else {
          this.logger.debug(`Enriched ${candidate.value} successfully`);
        }
      } catch (err) {
        this.logger.warn(
          `Enrichment failed for ${candidate.value}: ${(err as Error).message}`,
        );
        // Never throw — enrichment failure must NOT crash the pipeline
      }
    });

    await Promise.allSettled(enrichments);
  }
}
