import { ValueObject } from 'shared/kernel/value-object';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

interface ChainDetectionScoreProps {
  readonly chain: ChainId;
  readonly points: number;
  readonly reasons: ReadonlyArray<string>;
}

/**
 * Per-chain score from probing.
 *
 * Points accumulate per `docs/api/misc/chain-detection.md`:
 * - EVM: format 0x (40) + valid hex (30) + rpc responds (20) + has code (10)
 * - Solana: valid Base58 32 bytes (40) + rpc responds (30) + account exists (30)
 *
 * `reasons` is a human-readable list of what contributed.
 */
export class ChainDetectionScore extends ValueObject<ChainDetectionScoreProps> {
  protected constructor(props: ChainDetectionScoreProps) {
    super(props);
  }

  public static create(input: {
    chain: ChainId;
    points: number;
    reasons: string[];
  }): ChainDetectionScore {
    return new ChainDetectionScore({
      chain: input.chain,
      points: Math.max(0, input.points),
      reasons: Object.freeze([...input.reasons]),
    });
  }

  public get chain(): ChainId {
    return this.props.chain;
  }
  public get points(): number {
    return this.props.points;
  }
  public get reasons(): ReadonlyArray<string> {
    return this.props.reasons;
  }
}
