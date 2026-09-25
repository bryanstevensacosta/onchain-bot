/**
 * Fingerprint value object (moved from backend shared/deduplication, todo 4).
 *
 * Four fingerprint kinds per seen message: exact (channel+message identity),
 * content (normalized-content hash), one per normalized URL, and semantic
 * (channel+message identity anchoring the stored embedding).
 */
export type FingerprintType = 'exact' | 'content' | 'url' | 'semantic';

export class Fingerprint {
  private constructor(
    public readonly type: FingerprintType,
    public readonly value: string,
  ) {}

  public static exact(channelId: string, messageId: number): Fingerprint {
    return new Fingerprint('exact', `${channelId}:${messageId}`);
  }

  public static content(contentHash: string): Fingerprint {
    return new Fingerprint('content', contentHash);
  }

  public static url(normalizedUrl: string): Fingerprint {
    return new Fingerprint('url', normalizedUrl);
  }

  public static semantic(channelId: string, messageId: number): Fingerprint {
    return new Fingerprint('semantic', `${channelId}:${messageId}`);
  }

  public static of(type: FingerprintType, value: string): Fingerprint {
    return new Fingerprint(type, value);
  }

  public toString(): string {
    return `${this.type}:${this.value}`;
  }
}
