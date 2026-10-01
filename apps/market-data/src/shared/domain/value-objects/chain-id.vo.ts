import { ValueObject } from '../kernel/value-object';

/**
 * ChainId VO (Tramo 3, todo 1).
 *
 * Shared-kernel contract: chain slug, always lowercased + trimmed
 * (e.g. 'solana', 'ethereum'). Handle with care — downstream consumers
 * (token keys, provider routing) break if the normalization changes.
 */
export class ChainIdVo extends ValueObject<{ raw: string }> {
  private constructor(raw: string) {
    super({ raw });
  }

  public static from(raw: string): ChainIdVo {
    const normalized = (raw ?? '').trim().toLowerCase();
    if (normalized === '') {
      throw new Error('ChainId must be a non-empty string');
    }
    return new ChainIdVo(normalized);
  }

  public get raw(): string {
    return this.value.raw;
  }
}
