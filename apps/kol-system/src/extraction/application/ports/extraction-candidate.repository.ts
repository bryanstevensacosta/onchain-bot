import { ExtractionCandidate } from '../../domain/entities/extraction-candidate.entity';

export abstract class ExtractionCandidateRepository {
  abstract save(candidate: ExtractionCandidate): Promise<void>;
  abstract findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<ExtractionCandidate>>;
  abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionCandidate>>;
  abstract count(): Promise<number>;
}
