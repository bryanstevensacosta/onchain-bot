import { ValueObject } from '../kernel/value-object';

/**
 * ContentId VO (Tramo 2, todo 1).
 *
 * Opaque identity for queued content: `${contentType}:${source}:${externalId}`.
 * Lower-cased, trimmed; empty segments rejected.
 */
export class ContentId extends ValueObject<{ raw: string }> {
  private constructor(raw: string) {
    super({ raw });
  }

  public static from(contentType: string, source: string, externalId: string): ContentId {
    const parts = [contentType, source, externalId].map((p) => p.trim().toLowerCase());
    if (parts.some((p) => p === '')) {
      throw new Error('ContentId segments must be non-empty');
    }
    return new ContentId(parts.join(':'));
  }

  public get raw(): string {
    return this.value.raw;
  }
}
