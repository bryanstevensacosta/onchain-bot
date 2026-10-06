import { Injectable } from '@nestjs/common';
import type { ChainRpc } from 'provider/infrastructure/alchemy/alchemy.chains';
import type {
  MulticallClient,
  MulticallResult,
} from 'provider/infrastructure/alchemy/multicall.service';
import {
  decodeAddressReturn,
  decodeDecimalsReturn,
  decodeUint128Return,
  decodeV2Reserves,
  decodeV3FeeReturn,
  decodeV3Slot0,
  decodeV4Slot0,
  encodeBytes32ArgCall,
  encodeNoArgCall,
  ERC20_DECIMALS_SELECTOR,
  sqrtPriceX96ToPrice1Per0,
  v2ReservesToPrice1Per0,
  v4StateViewForChain,
  V2_DEFAULT_FEE_BPS,
  V2_GET_RESERVES_SELECTOR,
  V2_TOKEN0_SELECTOR,
  V2_TOKEN1_SELECTOR,
  V3_FEE_SELECTOR,
  V3_LIQUIDITY_SELECTOR,
  V3_SLOT0_SELECTOR,
  V4_GET_LIQUIDITY_SELECTOR,
  V4_GET_SLOT0_SELECTOR,
  V4_LENS_UNVERIFIED_REASON,
} from './evm-pools.codec';

/**
 * Lane E on-chain EVM reader (dexter plan todo 22).
 *
 * Reads pool state DIRECTLY from chain via the frozen Lane T transports
 * (`MulticallClient.tryAggregate` batch + `ChainRpc.getCode` existence
 * gate) — no aggregators, no indexer, no new deps. Mirrors the Lane S
 * `OnchainSolanaReaderService` shape (BigInt-first, decimals per leg,
 * fail-open `null`, never throws outward).
 *
 * Call budget per view (see the QPS comment in `evm-pools.codec.ts`):
 * 1 `eth_getCode` gate + 1 tryAggregate (3-6 inner calls) + 1
 * tryAggregate for leg decimals. No polling, no refresh, no cache —
 * the future snapshot-seam caller owns cadence.
 *
 * Family coverage:
 * - V2 (UniswapV2-style pairs): getReserves + token0/token1 +
 *   decimals-per-leg in style. Empty pool (both reserves zero) -> null.
 * - V3 (UniswapV3-style pools): slot0 + liquidity + fee + token0/1 +
 *   decimals-per-leg. Uninitialized (`sqrtPriceX96 == 0`) -> null.
 * - V4 (UniswapV4 via StateView lens, SINGLE tryAggregate round trip
 *   carrying `getSlot0(poolId)` + `getLiquidity(poolId)`): the pool id
 *   is bytes32 and carries NO decimals, so the caller supplies
 *   `decimals0/decimals1` (from the PoolKey currencies it already
 *   knows). Chains without a verified lens row resolve `null`
 *   (`v4-lens-unverified`) — never a guessed address.
 *
 * NOT wired into the snapshot pipeline (later todo — same rule as
 * Lane S; the tolerance seam is `evm-tolerance.ts`).
 */

export type OnchainEvmPoolFamily = 'v2' | 'v3' | 'v4';

export interface OnchainEvmPoolLeg {
  readonly token: string;
  readonly reserve: bigint;
  readonly decimals: number | null;
}

export interface OnchainEvmV2View {
  readonly family: 'v2';
  readonly chain: string;
  readonly pair: string;
  readonly legs: readonly [OnchainEvmPoolLeg, OnchainEvmPoolLeg];
  /** Pre-fee mid (v2-INCLUSIVE accounting — haircut V2_DEFAULT_FEE_BPS). */
  readonly price1Per0: number | null;
  readonly feeBpsDefault: typeof V2_DEFAULT_FEE_BPS;
  readonly blockTimestampLast: number;
}

export interface OnchainEvmV3View {
  readonly family: 'v3';
  readonly chain: string;
  readonly pool: string;
  readonly token0: string;
  readonly token1: string;
  readonly decimals0: number | null;
  readonly decimals1: number | null;
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly liquidity: bigint;
  /** Pool fee, hundredths of a bps (3000 = 0.3%), null when unread. */
  readonly fee: number | null;
  /** Fee-FREE spot (v4-EXCLUSIVE accounting — add the fee on top). */
  readonly price1Per0: number | null;
}

export interface OnchainEvmV4View {
  readonly family: 'v4';
  readonly chain: string;
  readonly poolId: string;
  readonly lens: string;
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly protocolFee: number;
  readonly lpFee: number;
  readonly liquidity: bigint;
  /** Fee-FREE spot (v4-EXCLUSIVE accounting — add the fee on top). */
  readonly price1Per0: number | null;
}

export interface OnchainEvmReader {
  getV2PoolView(chain: string, pair: string): Promise<OnchainEvmV2View | null>;
  getV3PoolView(chain: string, pool: string): Promise<OnchainEvmV3View | null>;
  getV4PoolView(
    chain: string,
    poolId: string,
    decimals0: number,
    decimals1: number,
  ): Promise<OnchainEvmV4View | null>;
}

const okValue = (
  results: ReadonlyArray<MulticallResult>,
  at: number,
): string | null => {
  const row = results[at] ?? null;
  if (row === null || row.ok !== true || row.value === null) return null;
  return row.value;
};

@Injectable()
export class OnchainEvmReaderService implements OnchainEvmReader {
  public constructor(
    private readonly multicall: MulticallClient,
    private readonly chainRpc: ChainRpc,
  ) {}

  /**
   * Existence gate (todo 21 discipline): an address with NO contract
   * code is an EOA-or-dead end — resolve `null` before burning a
   * batch. Transport miss (`null` code = unknown) FAILS OPEN into
   * the batch; only PROVEN-empty (`0x`) short-circuits.
   */
  private async hasContractCode(
    chain: string,
    address: string,
  ): Promise<boolean> {
    try {
      const code = await this.chainRpc.getCode(chain, address);
      if (code === null) return true;
      const trimmed = code.trim().toLowerCase();
      return trimmed !== '0x' && trimmed !== '0x0' && trimmed !== '';
    } catch {
      return true;
    }
  }

  private async readDecimals(
    chain: string,
    tokens: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<number | null>> {
    try {
      const results = await this.multicall.tryAggregate(
        chain,
        tokens.map((token) => ({
          target: token,
          callData: encodeNoArgCall(ERC20_DECIMALS_SELECTOR),
        })),
      );
      return tokens.map((_, i) => {
        const value = okValue(results, i);
        return value === null ? null : decodeDecimalsReturn(value);
      });
    } catch {
      return tokens.map(() => null);
    }
  }

  public async getV2PoolView(
    chain: string,
    pair: string,
  ): Promise<OnchainEvmV2View | null> {
    try {
      if (!(await this.hasContractCode(chain, pair))) return null;
      const results = await this.multicall.tryAggregate(chain, [
        { target: pair, callData: encodeNoArgCall(V2_GET_RESERVES_SELECTOR) },
        { target: pair, callData: encodeNoArgCall(V2_TOKEN0_SELECTOR) },
        { target: pair, callData: encodeNoArgCall(V2_TOKEN1_SELECTOR) },
      ]);
      const reservesHex = okValue(results, 0);
      const token0Hex = okValue(results, 1);
      const token1Hex = okValue(results, 2);
      if (reservesHex === null || token0Hex === null || token1Hex === null) {
        return null;
      }
      const reserves = decodeV2Reserves(reservesHex);
      const token0 = decodeAddressReturn(token0Hex);
      const token1 = decodeAddressReturn(token1Hex);
      if (reserves === null || token0 === null || token1 === null) return null;
      if (reserves.reserve0 === 0n && reserves.reserve1 === 0n) return null;
      const [decimals0, decimals1] = await this.readDecimals(chain, [
        token0,
        token1,
      ]);
      return {
        family: 'v2',
        chain,
        pair,
        legs: [
          { token: token0, reserve: reserves.reserve0, decimals: decimals0 },
          { token: token1, reserve: reserves.reserve1, decimals: decimals1 },
        ],
        price1Per0:
          decimals0 === null || decimals1 === null
            ? null
            : v2ReservesToPrice1Per0(
                reserves.reserve0,
                reserves.reserve1,
                decimals0,
                decimals1,
              ),
        feeBpsDefault: V2_DEFAULT_FEE_BPS,
        blockTimestampLast: reserves.blockTimestampLast,
      };
    } catch {
      return null;
    }
  }

  public async getV3PoolView(
    chain: string,
    pool: string,
  ): Promise<OnchainEvmV3View | null> {
    try {
      if (!(await this.hasContractCode(chain, pool))) return null;
      const results = await this.multicall.tryAggregate(chain, [
        { target: pool, callData: encodeNoArgCall(V3_SLOT0_SELECTOR) },
        { target: pool, callData: encodeNoArgCall(V3_LIQUIDITY_SELECTOR) },
        { target: pool, callData: encodeNoArgCall(V2_TOKEN0_SELECTOR) },
        { target: pool, callData: encodeNoArgCall(V2_TOKEN1_SELECTOR) },
        { target: pool, callData: encodeNoArgCall(V3_FEE_SELECTOR) },
      ]);
      const slot0Hex = okValue(results, 0);
      const liquidityHex = okValue(results, 1);
      const token0Hex = okValue(results, 2);
      const token1Hex = okValue(results, 3);
      const feeHex = okValue(results, 4);
      if (
        slot0Hex === null ||
        liquidityHex === null ||
        token0Hex === null ||
        token1Hex === null
      ) {
        return null;
      }
      const slot0 = decodeV3Slot0(slot0Hex);
      const liquidity = decodeUint128Return(liquidityHex);
      const token0 = decodeAddressReturn(token0Hex);
      const token1 = decodeAddressReturn(token1Hex);
      if (
        slot0 === null ||
        liquidity === null ||
        token0 === null ||
        token1 === null
      ) {
        return null;
      }
      const fee = feeHex === null ? null : decodeV3FeeReturn(feeHex);
      const [decimals0, decimals1] = await this.readDecimals(chain, [
        token0,
        token1,
      ]);
      return {
        family: 'v3',
        chain,
        pool,
        token0,
        token1,
        decimals0,
        decimals1,
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
        liquidity,
        fee,
        price1Per0:
          decimals0 === null || decimals1 === null
            ? null
            : sqrtPriceX96ToPrice1Per0(
                slot0.sqrtPriceX96,
                decimals0,
                decimals1,
              ),
      };
    } catch {
      return null;
    }
  }

  public async getV4PoolView(
    chain: string,
    poolId: string,
    decimals0: number,
    decimals1: number,
  ): Promise<OnchainEvmV4View | null> {
    try {
      const lens = v4StateViewForChain(chain);
      if (lens === null) return null;
      const slot0Call = encodeBytes32ArgCall(V4_GET_SLOT0_SELECTOR, poolId);
      const liquidityCall = encodeBytes32ArgCall(
        V4_GET_LIQUIDITY_SELECTOR,
        poolId,
      );
      if (slot0Call === null || liquidityCall === null) return null;
      if (!(await this.hasContractCode(chain, lens))) return null;
      const results = await this.multicall.tryAggregate(chain, [
        { target: lens, callData: slot0Call },
        { target: lens, callData: liquidityCall },
      ]);
      const slot0Hex = okValue(results, 0);
      const liquidityHex = okValue(results, 1);
      if (slot0Hex === null || liquidityHex === null) return null;
      const slot0 = decodeV4Slot0(slot0Hex);
      const liquidity = decodeUint128Return(liquidityHex);
      if (slot0 === null || liquidity === null) return null;
      return {
        family: 'v4',
        chain,
        poolId,
        lens,
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
        protocolFee: slot0.protocolFee,
        lpFee: slot0.lpFee,
        liquidity,
        price1Per0: sqrtPriceX96ToPrice1Per0(
          slot0.sqrtPriceX96,
          decimals0,
          decimals1,
        ),
      };
    } catch {
      return null;
    }
  }
}

export { V4_LENS_UNVERIFIED_REASON };
