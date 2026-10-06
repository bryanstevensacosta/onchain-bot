/**
 * EVM pool decoders for the Lane E on-chain readers (dexter plan todo 22).
 *
 * Pure ABI decode, zero deps (Buffer/bigint only). Every decoder returns
 * `null` on short/malformed input and never throws — decode misses degrade
 * to the fail-open `null` path in the reader, never to a crash.
 *
 * SELECTOR PROVENANCE (derived, not memorized): all selectors below were
 * derived on 2026-10-05 as `keccak256("<canonical signature>")[:4]` with
 * the environment's pre-installed pycryptodome (no new dep, no install).
 * Cross-checks that close the loop:
 * - `getReserves()` -> `0x0902f1ac`: the EXACT calldata of the live
 *   Lane T verification probe the same day (Uniswap V2 WETH/USDC
 *   `0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc` on ethereum via
 *   `ethereum-rpc.publicnode.com`, ONE `eth_call` to Multicall3) which
 *   returned `success=true` + 96 live bytes decoding to
 *   reserve0=10543620724770 (~10.54M USDC) / reserve1=3881028913582414867556
 *   (~3881 WETH) / blockTimestamp 11s stale — plausible vs the
 *   DexScreener-discovered ~$21M liquidity. That response is pinned as
 *   `LIVE_V2_TRYAGGREGATE_RETURN` in the spec.
 * - `tryAggregate(bool,(address,bytes)[])` recomputed to `0xbce38bd7`,
 *   byte-identical to Lane T's `TRY_AGGREGATE_SELECTOR` (independent
 *   cross-check of the Lane T codec).
 * - `liquidity()` derived to `0x1a686502` — memory said `0x1a686774`
 *   (WRONG); derivation over memory is why this file exists.
 * V2 `token0/token1`, ERC20 `decimals/totalSupply`, V3 `slot0/fee` all
 * matched memory AND derivation (belt + suspenders). V4
 * `getSlot0(bytes32)/getLiquidity(bytes32)` selectors come from the
 * doc-verified StateView signatures (`/uniswap/v4-periphery`
 * `StateView.md`: `getSlot0(PoolId)`/`getLiquidity(PoolId)` where
 * `PoolId` is bytes32).
 *
 * FEE SEMANTICS PER FAMILY (consumers must not mix these):
 * - V2 (reserves): the reserve ratio is a PRE-FEE mid. Execution takes
 *   the pool fee on swap-in (UniswapV2 default 0.3% = 30 bps,
 *   `V2_DEFAULT_FEE_BPS`; forks vary per pair — NOT on-chain here).
 *   Consumers quoting execution must haircut by the fee: v2-INCLUSIVE
 *   accounting (quoted price includes the fee drag).
 * - V3 (slot0) / V4 (StateView lens): `sqrtPriceX96` is the fee-FREE
 *   spot. The pool `fee()` (V3, hundredths of a bps, e.g. 3000 =
 *   0.3%) / `lpFee` (V4, same units, dynamic `2^23-1` flag possible)
 *   is charged ON TOP: v4-EXCLUSIVE accounting (add the fee
 *   separately; never subtract it from the spot).
 * - BigInt is MANDATORY for every reserve/liquidity/sqrt value in this
 *   file (uint112/128/160 exceed double precision); conversion to
 *   `number` happens ONLY at the final price ratio with finite/positive
 *   guards.
 *
 * QPS BUDGET (numeric assumptions; quota owner in the last line):
 * - Transport cost basis (Lane T comment in `alchemy.chains.ts`):
 *   one batched `eth_call`-via-tryAggregate ~= 26 CU FLAT regardless
 *   of inner call count; `eth_getCode` ~= 20 CU.
 * - Per pool view this lane spends: 1 existence `eth_getCode` (20 CU)
 *   + 1 tryAggregate of 3-6 inner calls (26 CU) + 1 tryAggregate for
 *   leg decimals (26 CU, skipped when cached by the caller) ~= 72 CU
 *   worst case, ~= 46 CU steady state.
 * - Readers perform ZERO polling/refresh: every method is on-demand
 *   (one view per call). Refresh cadence, if any, is owned by the
 *   FUTURE snapshot-seam caller, not by this file: 100 pools x 30s
 *   refresh ~= 100 x 46 CU / 30s ~= 153 CU/s — OVER the Alchemy free
 *   sustained ~115 CU/s (300M CU/mo), so a future integrator must
 *   either slow the cadence, narrow the pool set, or raise the tier.
 *   That decision is documented here so it cannot be silently inherited.
 * - Quota owner: whoever holds `ALCHEMY_API_KEY` (see `.env.example`).
 *   429/over-quota collapses to `null` in the transport; retry/backoff
 *   lives in the aggregator (todo 19b), never in these decoders.
 */

const strip0x = (hex: string): string =>
  hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;

/** Read the 32-byte word at `index` as bigint, or `null` past the end. */
function readWord(hex: string, index: number): bigint | null {
  const raw = strip0x(hex);
  const chars = index * 64;
  if (chars < 0 || chars + 64 > raw.length) return null;
  const word = raw.slice(chars, chars + 64);
  if (!/^[0-9a-fA-F]{64}$/.test(word)) return null;
  return BigInt(`0x${word}`);
}

// ── Selectors (derived 2026-10-05, see header) ───────────────────────

export const V2_GET_RESERVES_SELECTOR = '0x0902f1ac';
export const V2_TOKEN0_SELECTOR = '0x0dfe1681';
export const V2_TOKEN1_SELECTOR = '0xd21220a7';
export const ERC20_DECIMALS_SELECTOR = '0x313ce567';
export const ERC20_TOTAL_SUPPLY_SELECTOR = '0x18160ddd';
export const V3_SLOT0_SELECTOR = '0x3850c7bd';
export const V3_LIQUIDITY_SELECTOR = '0x1a686502';
export const V3_FEE_SELECTOR = '0xddca3f43';
export const V4_GET_SLOT0_SELECTOR = '0xc815641c';
export const V4_GET_LIQUIDITY_SELECTOR = '0xfa6793d5';

/** UniswapV2 default swap fee (bps). Per-pair on forks — NOT on-chain. */
export const V2_DEFAULT_FEE_BPS = 30;

// ── V4 lens table (verify-per-chain or mark unsupported) ──────────────

/**
 * ReservesLens (same address on every supported chain — canonical
 * CREATE2 deployer; `/uniswap/docs` "reading-pool-reserves" guide).
 * StateView addresses below are individually confirmed in the official
 * v4 deployments table (`/uniswap/docs` `protocols/v4/deployments`):
 * ethereum + base rows read 2026-10-05.
 */
export const V4_RESERVES_LENS_ADDRESS =
  '0x0000001b173C3bbF3984D417d8614E3eed34865B';

/**
 * StateView per OUR chain id. Chains WITHOUT a row are explicitly
 * UNSUPPORTED (`v4StateViewForChain` returns `null` + the reader
 * resolves `null` with reason `v4-lens-unverified`): bsc, arbitrum,
 * polygon, optimism and unichain sit in the docs' "same address on all
 * supported chains" claim for ReservesLens, but their StateView rows
 * were NOT individually read this lane, so no row is invented.
 * Robinhood has no transport row at all (Lane T) — unsupported too.
 */
export const V4_STATE_VIEW_BY_CHAIN: Readonly<Record<string, string>> = {
  ethereum: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
  base: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
};

export const V4_LENS_UNVERIFIED_REASON = 'v4-lens-unverified';

export function v4StateViewForChain(chain: string): string | null {
  return V4_STATE_VIEW_BY_CHAIN[chain] ?? null;
}

// ── Calldata encoders ────────────────────────────────────────────────

/** `0x<selector>` for no-arg reads (getReserves/slot0/liquidity/fee/...). */
export function encodeNoArgCall(selector: string): string {
  return selector.startsWith('0x') ? selector : `0x${selector}`;
}

/** `0x<selector><32-byte arg>` for `getSlot0(bytes32)`-shaped reads. */
export function encodeBytes32ArgCall(
  selector: string,
  arg32: string,
): string | null {
  const raw = strip0x(arg32);
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return null;
  const head = strip0x(selector);
  if (!/^[0-9a-fA-F]{8}$/.test(head)) return null;
  return `0x${head}${raw.toLowerCase()}`;
}

// ── Return-data decoders (all BigInt-first, null on miss) ────────────

export interface DecodedV2Reserves {
  readonly reserve0: bigint;
  readonly reserve1: bigint;
  readonly blockTimestampLast: number;
}

const MASK_112 = (1n << 112n) - 1n;
const MASK_160 = (1n << 160n) - 1n;
const MASK_128 = (1n << 128n) - 1n;
const MASK_24 = (1n << 24n) - 1n;

/** `getReserves()`: 3 words (uint112/uint112/uint32). Needs >= 96 bytes. */
export function decodeV2Reserves(data: string): DecodedV2Reserves | null {
  try {
    const r0 = readWord(data, 0);
    const r1 = readWord(data, 1);
    const ts = readWord(data, 2);
    if (r0 === null || r1 === null || ts === null) return null;
    if (ts > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return {
      reserve0: r0 & MASK_112,
      reserve1: r1 & MASK_112,
      blockTimestampLast: Number(ts & 0xffffffffn),
    };
  } catch {
    return null;
  }
}

/**
 * Single-address return (`token0()/token1()`): 32 bytes, the first 12
 * MUST be zero padding (non-zero prefix = not an address -> `null`).
 */
export function decodeAddressReturn(data: string): string | null {
  try {
    const word = readWord(data, 0);
    if (word === null) return null;
    if (word >> 160n !== 0n) return null;
    const hex = word.toString(16).padStart(64, '0');
    return `0x${hex.slice(24).toLowerCase()}`;
  } catch {
    return null;
  }
}

/** `decimals()`: uint8 — the word MUST fit in 8 bits, else `null`. */
export function decodeDecimalsReturn(data: string): number | null {
  try {
    const word = readWord(data, 0);
    if (word === null || word < 0n || word > 255n) return null;
    return Number(word);
  } catch {
    return null;
  }
}

/** `totalSupply()` / `liquidity()`-shaped uint256/uint128 words. */
export function decodeUint256Return(data: string): bigint | null {
  try {
    return readWord(data, 0);
  } catch {
    return null;
  }
}

export function decodeUint128Return(data: string): bigint | null {
  try {
    const word = readWord(data, 0);
    return word === null ? null : word & MASK_128;
  } catch {
    return null;
  }
}

export interface DecodedV3Slot0 {
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
}

const signExtend24 = (word: bigint): number => {
  const masked = word & 0xffffffn;
  const signed = masked >= 1n << 23n ? masked - (1n << 24n) : masked;
  return Number(signed);
};

/**
 * V3 `slot0()`: head is (uint160 sqrtPriceX96, int24 tick, ...).
 * `sqrtPriceX96 == 0` = UNINITIALIZED pool -> `null` (never a price).
 * Needs >= 64 bytes (rest of the 7-word tuple is ignored).
 */
export function decodeV3Slot0(data: string): DecodedV3Slot0 | null {
  try {
    const w0 = readWord(data, 0);
    const w1 = readWord(data, 1);
    if (w0 === null || w1 === null) return null;
    const sqrtPriceX96 = w0 & MASK_160;
    if (sqrtPriceX96 === 0n) return null;
    return { sqrtPriceX96, tick: signExtend24(w1) };
  } catch {
    return null;
  }
}

/** V3 `fee()`: uint24 in hundredths of a bps (3000 = 0.3%). */
export function decodeV3FeeReturn(data: string): number | null {
  try {
    const word = readWord(data, 0);
    if (word === null) return null;
    const fee = word & MASK_24;
    if (fee !== word) return null;
    return Number(fee);
  } catch {
    return null;
  }
}

export interface DecodedV4Slot0 {
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly protocolFee: number;
  readonly lpFee: number;
}

/**
 * StateView `getSlot0(bytes32)`: (uint160, int24, uint24, uint24).
 * Same uninitialized rule as V3 (`sqrtPriceX96 == 0` -> `null`).
 * Needs >= 128 bytes.
 */
export function decodeV4Slot0(data: string): DecodedV4Slot0 | null {
  try {
    const w0 = readWord(data, 0);
    const w1 = readWord(data, 1);
    const w2 = readWord(data, 2);
    const w3 = readWord(data, 3);
    if (w0 === null || w1 === null || w2 === null || w3 === null) return null;
    const sqrtPriceX96 = w0 & MASK_160;
    if (sqrtPriceX96 === 0n) return null;
    const protocolFee = w2 & MASK_24;
    const lpFee = w3 & MASK_24;
    if (protocolFee !== w2 || lpFee !== w3) return null;
    return {
      sqrtPriceX96,
      tick: signExtend24(w1),
      protocolFee: Number(protocolFee),
      lpFee: Number(lpFee),
    };
  } catch {
    return null;
  }
}

// ── Price math (number only at the final ratio) ───────────────────────

const Q96 = 2 ** 96;

/**
 * Spot price of token1 in units of token0 from Q64.96 sqrt price:
 * `price = (sqrtP / 2^96)^2 * 10^(dec0 - dec1)`.
 * Fee-FREE spot (V3/V4-exclusive semantics — add the fee on top).
 */
export function sqrtPriceX96ToPrice1Per0(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number | null {
  try {
    if (sqrtPriceX96 <= 0n) return null;
    if (
      !Number.isInteger(decimals0) ||
      !Number.isInteger(decimals1) ||
      decimals0 < 0 ||
      decimals1 > 77 ||
      decimals0 > 77 ||
      decimals1 < 0
    ) {
      return null;
    }
    const asNumber = Number(sqrtPriceX96);
    if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
    const ratio = asNumber / Q96;
    const price = ratio * ratio * 10 ** (decimals0 - decimals1);
    if (!Number.isFinite(price) || price <= 0) return null;
    return price;
  } catch {
    return null;
  }
}

/**
 * V2 spot price of token1 in units of token0 from raw reserves:
 * `price = (r0 / 10^d0) / (r1 / 10^d1)`. PRE-FEE mid (v2-INCLUSIVE
 * accounting — haircut `V2_DEFAULT_FEE_BPS` for execution quotes).
 * Zero reserves -> `null` (empty pool has no price).
 */
export function v2ReservesToPrice1Per0(
  reserve0: bigint,
  reserve1: bigint,
  decimals0: number,
  decimals1: number,
): number | null {
  try {
    if (reserve0 <= 0n || reserve1 <= 0n) return null;
    if (
      !Number.isInteger(decimals0) ||
      !Number.isInteger(decimals1) ||
      decimals0 < 0 ||
      decimals1 < 0 ||
      decimals0 > 77 ||
      decimals1 > 77
    ) {
      return null;
    }
    const r0 = Number(reserve0);
    const r1 = Number(reserve1);
    if (!Number.isFinite(r0) || !Number.isFinite(r1) || r0 <= 0 || r1 <= 0) {
      return null;
    }
    const price = r0 / r1 / 10 ** (decimals0 - decimals1);
    if (!Number.isFinite(price) || price <= 0) return null;
    return price;
  } catch {
    return null;
  }
}
