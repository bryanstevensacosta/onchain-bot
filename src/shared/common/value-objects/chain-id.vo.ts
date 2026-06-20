/**
 * Canonical chain identifier — promoted to shared kernel.
 *
 * Originally owned by `ca/chain-detection/domain/value-objects/chain-id.vo.ts`.
 * Promoted because it is imported by 9 BCs (chain-detection, classification,
 * scoring, filters, enrichment, honeypot, analytics, publishing/telegram,
 * plus itself), making it a cross-BC shared value object.
 *
 * v1 supports `ethereum` (Alchemy) and `solana` (Helius).
 * Future v2 will add BSC, Base, Arbitrum, Polygon (all EVM via Alchemy).
 *
 * `unknown` is allowed only as input from upstream — never as a
 * detection result.
 *
 * IMPORTANT: This is now a **shared kernel contract**. Changing the
 * payload (adding a new chain id, changing validation rules) is a
 * breaking change for ALL importing BCs. Coordinate changes carefully.
 */
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type ChainIdValue =
  | 'ethereum'
  | 'solana'
  | 'bsc'
  | 'base'
  | 'arbitrum'
  | 'polygon'
  | 'unknown';

interface ChainIdProps {
  readonly value: ChainIdValue;
}

export class ChainId extends ValueObject<ChainIdProps> {
  public static readonly ETHEREUM = new ChainId({ value: 'ethereum' });
  public static readonly SOLANA = new ChainId({ value: 'solana' });
  public static readonly BSC = new ChainId({ value: 'bsc' });
  public static readonly BASE = new ChainId({ value: 'base' });
  public static readonly ARBITRUM = new ChainId({ value: 'arbitrum' });
  public static readonly POLYGON = new ChainId({ value: 'polygon' });
  public static readonly UNKNOWN = new ChainId({ value: 'unknown' });

  private static readonly VALID_VALUES = new Set<ChainIdValue>([
    'ethereum',
    'solana',
    'bsc',
    'base',
    'arbitrum',
    'polygon',
    'unknown',
  ]);

  protected constructor(props: ChainIdProps) {
    super(props);
  }

  public static fromString(raw: string): ChainId {
    const value = raw.toLowerCase() as ChainIdValue;
    if (!ChainId.VALID_VALUES.has(value)) {
      throw new DomainError(
        ErrorCode.UNSUPPORTED_CHAIN,
        `Unknown chain: ${raw}`,
        { raw },
      );
    }
    return new ChainId({ value });
  }

  public get value(): ChainIdValue {
    return this.props.value;
  }

  public get isEvm(): boolean {
    return ['ethereum', 'bsc', 'base', 'arbitrum', 'polygon'].includes(
      this.props.value,
    );
  }

  public get isSolana(): boolean {
    return this.props.value === 'solana';
  }
}
