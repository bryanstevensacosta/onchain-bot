/**
 * Fingerprint Value Object for deduplication.
 *
 * Immutable value object representing different types of fingerprints.
 */

import { ValueObject } from 'shared/kernel/value-object';

export type FingerprintType = 'exact' | 'content' | 'url' | 'semantic';

interface FingerprintProps {
  readonly type: FingerprintType;
  readonly value: string;
}

/**
 * Fingerprint for deduplication.
 *
 * Different fingerprint types:
 * - exact: Exact match via channelId:messageId
 * - content: SHA256 hash of normalized content
 * - url: Normalized URL
 * - semantic: Semantic match via channelId:messageId
 */
export class Fingerprint extends ValueObject<FingerprintProps> {
  private constructor(props: FingerprintProps) {
    super(props);
  }

  /**
   * Creates an exact fingerprint from channel ID and message ID.
   */
  public static exact(channelId: string, messageId: number): Fingerprint {
    return new Fingerprint({
      type: 'exact',
      value: `${channelId}:${messageId}`,
    });
  }

  /**
   * Creates a content fingerprint from a SHA256 hash.
   */
  public static content(hash: string): Fingerprint {
    return new Fingerprint({
      type: 'content',
      value: hash,
    });
  }

  /**
   * Creates a URL fingerprint from a normalized URL.
   */
  public static url(normalizedUrl: string): Fingerprint {
    return new Fingerprint({
      type: 'url',
      value: normalizedUrl,
    });
  }

  /**
   * Creates a semantic fingerprint from channel ID and message ID.
   */
  public static semantic(channelId: string, messageId: number): Fingerprint {
    return new Fingerprint({
      type: 'semantic',
      value: `${channelId}:${messageId}`,
    });
  }

  /**
   * Returns the fingerprint type.
   */
  public get type(): FingerprintType {
    return this.props.type;
  }

  /**
   * Returns the fingerprint value.
   */
  public get value(): string {
    return this.props.value;
  }

  /**
   * Returns string representation as type:value.
   */
  public toString(): string {
    return `${this.props.type}:${this.props.value}`;
  }
}
