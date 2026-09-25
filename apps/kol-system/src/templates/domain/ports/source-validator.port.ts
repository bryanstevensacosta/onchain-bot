export interface SourceValidationResult {
  readonly valid: ReadonlyArray<string>;
  readonly unknownIds: ReadonlyArray<string>;
}

/**
 * Validates template `kolSourceIds` against the ingestion feed
 * (`GET /api/feed/sources?type=kol`, P16). Fail-open: an unreachable feed
 * accepts everything (unknownIds empty) so the pipeline keeps running.
 */
export abstract class SourceValidatorPort {
  public abstract validateSources(
    channelIds: ReadonlyArray<string>,
  ): Promise<SourceValidationResult>;
}
