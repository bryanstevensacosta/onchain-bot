import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../../shared/kernel/domain-error';
import { ExtractionCandidate } from '../../../extraction/domain/entities/extraction-candidate.entity';
import { ParsedCall } from '../../domain/entities/parsed-call.entity';
import { ParserPort } from '../../domain/ports/parser.port';
import { ParsedCallRepository } from '../ports/parsed-call.repository';

export interface ParseFromCandidatesInput {
  readonly candidates: ReadonlyArray<ExtractionCandidate>;
  readonly rawText?: string;
}

export interface ParseFromCandidatesResult {
  /** One ParsedCall per parseable candidate (P5 1:1, order = contractIndex). */
  readonly parsed: ReadonlyArray<ParsedCall>;
  readonly discarded: number;
}

/**
 * Parse extraction candidates into structured calls (P5: 1:1, no collapse).
 *
 * Direct call, fix-1: invoked synchronously with the candidates as an
 * argument — no event bus on the way in or out (kol-calls wires no bus;
 * the head of the money-path stays synchronous/deterministic).
 *
 * Override of the backend `ParseFromCandidatesUseCase`: the backend
 * collapses all addresses to `addresses[0]` (`ParsedContract.fromAddresses`)
 * and emits ONE `TokenCall` per message. Here every candidate keeps its
 * OWN address — `parsed.length === candidates.length` (minus discards).
 *
 * Ticker resolution per mention: the candidate's own first ticker wins
 * (extraction-time context), falling back to the message-level heuristic.
 * An illegible candidate is discarded with a warn log — the pipeline
 * keeps going (adversarial: one bad mention never kills the batch).
 */
@Injectable()
export class ParseFromCandidatesUseCase {
  private readonly logger = new Logger(ParseFromCandidatesUseCase.name);

  public constructor(
    private readonly parser: ParserPort,
    private readonly callRepo: ParsedCallRepository,
  ) {}

  public async execute(
    input: ParseFromCandidatesInput,
  ): Promise<ParseFromCandidatesResult> {
    const candidates = input.candidates ?? [];
    if (candidates.length === 0) {
      return { parsed: [], discarded: 0 };
    }

    const fields = await this.parser.parse({ rawText: input.rawText ?? '' });

    const parsed: ParsedCall[] = [];
    let discarded = 0;

    for (const candidate of candidates) {
      try {
        const call = ParsedCall.create({
          kolId: candidate.kolId,
          messageId: candidate.messageId,
          contractIndex: candidate.contractIndex,
          occurredAt: candidate.occurredAt,
          contractAddress: candidate.contractAddress,
          ticker: candidate.tickers[0]?.value ?? fields.ticker,
          name: fields.name,
          chart: fields.chart,
          handle: candidate.handle,
          channelId: candidate.channelId,
        });
        parsed.push(call);
      } catch (err) {
        discarded += 1;
        const reason =
          err instanceof DomainError
            ? `${err.code}: ${err.message}`
            : (err as Error).message;
        this.logger.warn(
          `Discarding illegible candidate at index ${parsed.length + discarded - 1} (${reason})`,
        );
      }
    }

    for (const call of parsed) {
      await this.callRepo.save(call);
    }

    return { parsed, discarded };
  }
}
