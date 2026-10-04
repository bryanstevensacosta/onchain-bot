/**
 * Minimal DomainError taxonomy (mirrors feed-publisher/publishing-queue).
 * Carries an HTTP status + machine code so the filter can map it.
 */
export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
