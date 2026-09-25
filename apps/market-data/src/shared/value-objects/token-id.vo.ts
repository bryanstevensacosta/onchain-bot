import { ValueObject } from '../kernel/value-object';
import { ChainIdVo } from './chain-id.vo';

/**
 * TokenId VO (Tramo 3, todo 1).
 *
 * Shared-kernel contract: composite identity `${chain}:${address}`,
 * lowercased (same key rule as the backend canonical call). Handle with
 * care — payload/key changes break downstream consumers.
 */
export class TokenIdVo extends ValueObject<{ chain: string; address: string }> {
  private constructor(chain: string, address: string) {
    super({ chain, address });
  }

  public static from(chain: string, address: string): TokenIdVo {
    const normalizedChain = ChainIdVo.from(chain).raw;
    const normalizedAddress = (address ?? '').trim().toLowerCase();
    if (normalizedAddress === '') {
      throw new Error('TokenId address must be a non-empty string');
    }
    return new TokenIdVo(normalizedChain, normalizedAddress);
  }

  public static parse(key: string): TokenIdVo {
    const separator = (key ?? '').indexOf(':');
    if (separator <= 0) {
      throw new Error(`Invalid token key (expected chain:address): ${key}`);
    }
    return TokenIdVo.from(
      key.slice(0, separator),
      key.slice(separator + 1),
    );
  }

  public get chain(): string {
    return this.value.chain;
  }

  public get address(): string {
    return this.value.address;
  }

  public get key(): string {
    return `${this.value.chain}:${this.value.address}`;
  }
}
