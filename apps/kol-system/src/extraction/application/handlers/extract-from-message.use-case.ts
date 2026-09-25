import { Injectable } from '@nestjs/common';
import { ExtractorPort } from '../../domain/ports/extractor.port';
import { ExtractionCandidate } from '../../domain/entities/extraction-candidate.entity';
import { ExtractionSnapshotBase } from '../../domain/snapshot-base';
import { ExtractionCandidateRepository } from '../ports/extraction-candidate.repository';

export interface ExtractFromMessageInput {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly text: string;
  readonly handle?: string | null;
  readonly channelUrl?: string | null;
  readonly channelId?: string | null;
  readonly channelTitle?: string | null;
}

export interface ExtractFromMessageResult {
  readonly candidates: ReadonlyArray<ExtractionCandidate>;
  /**
   * P26 snapshot bases, one per candidate, handed DIRECTLY to enrichment
   * (return value, not an event — see below).
   */
  readonly snapshotBases: ReadonlyArray<ExtractionSnapshotBase>;
}

/**
 * Extract contract mentions from one KOL message (P5: contract x mention).
 *
 * Direct call, fix-1: invoked synchronously by the ingestion handler with
 * the raw text as an argument — raw text NEVER crosses an event bus.
 * No bus is used on the way out either: the P26 snapshot bases are
 * returned to the caller for a direct handoff to enrichment. Rationale:
 * kol-system wires no event bus at this stage, the head of the money-path
 * stays synchronous/deterministic (no lossy pub/sub between extraction and
 * enrichment), and the snapshot row itself is owned by the planned
 * `src/snapshot/` module (P27) which enrichment will write via port.
 *
 * One candidate per contract occurrence (no collapse, repeats valid);
 * text without contracts yields empty arrays, never a throw.
 */
@Injectable()
export class ExtractFromMessageUseCase {
  public constructor(
    private readonly extractor: ExtractorPort,
    private readonly candidateRepo: ExtractionCandidateRepository,
  ) {}

  public async execute(
    input: ExtractFromMessageInput,
  ): Promise<ExtractFromMessageResult> {
    const extracted = await this.extractor.extract({
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      text: input.text ?? '',
    });

    const ingestedAtKol = new Date();
    const candidates: ExtractionCandidate[] = [];
    const snapshotBases: ExtractionSnapshotBase[] = [];

    extracted.contractAddresses.forEach((contractAddress, index) => {
      const candidate = ExtractionCandidate.create({
        kolId: input.kolId,
        messageId: input.messageId,
        occurredAt: input.occurredAt,
        contractAddress,
        contractIndex: index,
        tickers: extracted.tickers,
        urls: extracted.urls,
        handle: input.handle ?? null,
        channelUrl: input.channelUrl ?? null,
        channelId: input.channelId ?? null,
        channelTitle: input.channelTitle ?? null,
      });
      candidates.push(candidate);
      snapshotBases.push(candidate.toSnapshotBase(ingestedAtKol));
    });

    for (const candidate of candidates) {
      await this.candidateRepo.save(candidate);
    }

    return { candidates, snapshotBases };
  }
}
