import { Injectable, Logger } from '@nestjs/common';
import { DataProviderPort } from '../../domain/data-provider.port';
import { AlchemyService } from './alchemy.service';
import { EVM_CHAIN_TRANSPORTS, MULTICALL3_ADDRESS } from './alchemy.chains';
import {
  decodeTryAggregateReturnData,
  encodeTryAggregate,
} from './multicall.codec';

/**
 * Multicall3 deployment (Lane T, todo 22): the canonical address
 * `0xcA11bde05977b3631167028862bE2a173976CA11` (same on every
 * supported chain — table-driven per chain in `alchemy.chains.ts` so
 * Robinhood plugs in later). Verified PRESENT on
 * Base/ETH/BSC/Arb/OP/Poly/Unichain via `eth_getCode` on 2026-10-05.
 * MakerDAO Multicall2 is deliberately NOT used (Mainnet + testnets
 * only).
 *
 * @see https://github.com/mds1/multicall
 */
export { MULTICALL3_ADDRESS };

export interface MulticallCall {
  readonly target: string;
  readonly callData: string;
}

export interface MulticallResult {
  readonly ok: boolean;
  readonly value: string | null;
}

/**
 * Stable multicall contract for Lane S/E readers (Lane T, todo 22).
 *
 * FROZEN: tryAggregate semantics — one revert NEVER fails the batch;
 * every input yields exactly one output IN ORDER (`ok:false` carries
 * `value:null`). Unknown/unsupported chains resolve all-`ok:false`
 * (fail-open, never throws).
 */
export interface MulticallClient {
  tryAggregate(
    chain: string,
    calls: ReadonlyArray<MulticallCall>,
  ): Promise<ReadonlyArray<MulticallResult>>;
}

export const MULTICALL_AGGREGATE_TIMEOUT_MS = 7_500;
export const MULTICALL_PER_CALL_TIMEOUT_MS = 5_000;

async function withAbortTimeout<T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

const ALL_FALSE = (
  calls: ReadonlyArray<MulticallCall>,
): ReadonlyArray<MulticallResult> =>
  calls.map(() => ({ ok: false, value: null }));

@Injectable()
export class MulticallService
  extends DataProviderPort
  implements MulticallClient
{
  public readonly name = 'multicall';
  protected readonly logger = new Logger(MulticallService.name);

  public constructor(private readonly chainRpc: AlchemyService) {
    super();
  }

  public async tryAggregate(
    chain: string,
    calls: ReadonlyArray<MulticallCall>,
  ): Promise<ReadonlyArray<MulticallResult>> {
    if (calls.length === 0) return [];
    const deployment = EVM_CHAIN_TRANSPORTS[chain]?.multicall3 ?? null;
    if (deployment === null) {
      this.logger.debug(`tryAggregate: unsupported chain ${chain}`);
      return ALL_FALSE(calls);
    }
    try {
      const raw = await withAbortTimeout(
        MULTICALL_AGGREGATE_TIMEOUT_MS,
        (signal) =>
          this.chainRpc.ethCall(
            chain,
            deployment,
            encodeTryAggregate(calls),
            'latest',
            { signal },
          ),
      );
      if (raw !== null) {
        const decoded = decodeTryAggregateReturnData(raw);
        if (decoded !== null && decoded.length === calls.length) return decoded;
        this.logger.debug(
          `tryAggregate: undecodable return on ${chain}, per-call fallback`,
        );
      }
    } catch (err) {
      this.logger.debug(
        `tryAggregate: aggregate failed on ${chain}, per-call fallback: ${(err as Error).message}`,
      );
    }
    return this.fallbackPerCall(chain, calls);
  }

  /**
   * Documented per-chain fallback: one `eth_call` per target, each
   * with its OWN AbortController timeout racing in parallel — losers
   * are aborted (socket cancelled), not merely ignored.
   */
  private async fallbackPerCall(
    chain: string,
    calls: ReadonlyArray<MulticallCall>,
  ): Promise<ReadonlyArray<MulticallResult>> {
    return Promise.all(
      calls.map(async (call): Promise<MulticallResult> => {
        try {
          const value = await withAbortTimeout(
            MULTICALL_PER_CALL_TIMEOUT_MS,
            (signal) =>
              this.chainRpc.ethCall(
                chain,
                call.target,
                call.callData,
                'latest',
                { signal },
              ),
          );
          return value === null
            ? { ok: false, value: null }
            : { ok: true, value };
        } catch {
          return { ok: false, value: null };
        }
      }),
    );
  }
}
