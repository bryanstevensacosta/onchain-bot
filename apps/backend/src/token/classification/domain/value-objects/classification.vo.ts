import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type ClassificationValue =
  | 'TOKEN'
  | 'POOL'
  | 'ROUTER'
  | 'NFT'
  | 'UNKNOWN';

interface ClassificationProps {
  readonly value: ClassificationValue;
}

/**
 * TYPE of a token/address (what IS it). Independent of SECURITY.
 *
 * N14 refactor: removed `SCAM` from this enum. SCAM is a security
 * assessment, not a type. Use `SecurityFlag` (in `token/honeypot/`) for
 * security state.
 *
 * v1 heuristic (per docs/api/misc/ca.md):
 * - TOKEN: most common — has pairs, has holders, has liquidity
 * - POOL: rare in v1 (would need ABI-level signal)
 * - ROUTER: rare in v1
 * - NFT: rare in v1 (would need tokenURI/ownerOf signal)
 * - UNKNOWN: no market data, no pairs, no holders
 */
export class Classification extends ValueObject<ClassificationProps> {
  public static readonly TOKEN = new Classification({ value: 'TOKEN' });
  public static readonly POOL = new Classification({ value: 'POOL' });
  public static readonly ROUTER = new Classification({ value: 'ROUTER' });
  public static readonly NFT = new Classification({ value: 'NFT' });
  public static readonly UNKNOWN = new Classification({ value: 'UNKNOWN' });

  private static readonly VALID = new Set<ClassificationValue>([
    'TOKEN',
    'POOL',
    'ROUTER',
    'NFT',
    'UNKNOWN',
  ]);

  protected constructor(props: ClassificationProps) {
    super(props);
  }

  public static fromString(raw: string): Classification {
    const value = raw.toUpperCase() as ClassificationValue;
    if (!Classification.VALID.has(value)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid classification: ${raw}`,
        { raw },
      );
    }
    return new Classification({ value });
  }

  public get value(): ClassificationValue {
    return this.props.value;
  }
}
