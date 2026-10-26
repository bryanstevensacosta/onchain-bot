import type { HolderConcentration } from 'snapshot/domain/snapshot-quote.types';
import {
  HOLDER_CONCENTRATION_PERCENT_EPSILON,
  HOLDER_CONCENTRATION_TOP10_N,
  HOLDER_CONCENTRATION_TOP_N,
} from 'snapshot/domain/snapshot-holder-concentration';
import { base64ToBytes } from 'provider/infrastructure/onchain/codec-utils';
import {
  decodeTokenAccount,
  isUninitializedTokenAccount,
} from 'provider/infrastructure/onchain/token-accounts.codec';
import { SYSTEM_PROGRAM_ID } from 'provider/infrastructure/onchain/solana-program-ids';
import type {
  SolanaAccountInfoValue,
  TokenAccountEntry,
} from 'provider/infrastructure/solana-rpc/solana-rpc.types';

/**
 * Holder concentration calculator (`rick-compact-card` §10, lane TH —
 * Solana-only). Implements the frozen policy documented in
 * `snapshot/domain/snapshot-holder-concentration.ts`:
 *
 * merge (BigInt, by decoded owner) -> drop zero -> exclusions
 * (uninitialized -> burn `1111…` -> wallet-null -> program-owned) ->
 * descending sort -> `min(n)` accumulators -> guards/clamp.
 *
 * TRANSPORT: exactly TWO `getMultipleAccounts` batches on the happy
 * path — ONE for the ATAs returned by `getTokenLargestAccounts` (their
 * `owner` is the holder wallet; the ATA entry itself carries no owner)
 * and ONE for the merged wallets (to exclude on-chain-null and
 * program-owned accounts). Chunking is the RPC service's job (<=100 per
 * batch, one parallel round); this calculator never chunks.
 *
 * DECODE: reuses the EXISTING `decodeTokenAccount` (`>= 165` bytes,
 * program-agnostic — Token-2022 with extensions decodes too) and
 * `isUninitializedTokenAccount`; the repo never gets a second token
 * account decoder. A null/short/foreign-mint account is SKIPPED, never
 * fatal (partial decode still pays both batches, as designed).
 *
 * FAIL-OPEN: any gap (supply 0/null, no largest accounts, every wallet
 * excluded, decode all-null, unexpected throw) resolves `null` — the
 * field is silence and never blocks the card.
 */

/**
 * Minimal structural RPC seam (the real `SolanaRpcService` satisfies
 * it). `getTokenSupply` resolves the inner `value` (amount+decimals),
 * `getTokenLargestAccounts` the account array (no owner — owner comes
 * from decode), and `getMultipleAccounts` one entry per requested
 * address IN ORDER (`null` for missing accounts, never throws).
 */
export interface HolderConcentrationRpc {
  /**
   * The real `SolanaRpcService` types this as `GetTokenSupplyResult['value']
   * | null`, and `value` is OPTIONAL on the envelope — hence the
   * `undefined` in the union (the calculator uses `supply?.amount`, so
   * all three holes collapse to the same fail-open path).
   */
  getTokenSupply(mintAddress: string): Promise<
    | {
        readonly amount: string;
        readonly decimals: number;
      }
    | null
    | undefined
  >;
  getTokenLargestAccounts(
    mintAddress: string,
  ): Promise<ReadonlyArray<Pick<TokenAccountEntry, 'address'>> | null>;
  getMultipleAccounts(
    addresses: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SolanaAccountInfoValue | null>>;
}

/** Clamp one percentage into the dexter-accepted `[0,100]` display range. */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Base64 account data -> bytes, `null` on any malformed payload. */
function readAccountBytes(
  info: SolanaAccountInfoValue | null | undefined,
): Uint8Array | null {
  if (info === null || info === undefined) return null;
  const payload = info.data?.[0];
  if (typeof payload !== 'string') return null;
  return base64ToBytes(payload);
}

/** Base-unit amount string -> BigInt, `null` when absent/garbage. */
function parseAmount(raw: string | null | undefined): bigint | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * Pure post-processing step: takes the already merged/filtered percents
 * in DESCENDING order and applies the §10.6.7 hard guards. Exported so
 * the non-finite / range / clamp / `min(10,n)` rules are directly
 * unit-testable without an RPC fixture.
 *
 * - `[]` -> `null` (0 eligible wallets = silence, never an empty row).
 * - any non-finite value inside the counted window -> `null` (checked
 *   BEFORE the clamp: clamping `Infinity` would invent `100`).
 * - top-10 outside `[-ε, 100+ε]` -> `null` (never a bad card).
 * - inside the margin -> clamp to `[0,100]` (a legitimately 100%-held
 *   token must not die on a ulp); per-value clamps keep every emitted
 *   percent inside the client's accepted `0..100`.
 */
export function buildHolderConcentration(
  sortedPercents: ReadonlyArray<number>,
): HolderConcentration | null {
  const counted = Math.min(sortedPercents.length, HOLDER_CONCENTRATION_TOP10_N);
  if (counted === 0) return null;

  let top10Raw = 0;
  for (let i = 0; i < counted; i += 1) {
    const value = sortedPercents[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    top10Raw += value;
  }
  if (
    top10Raw < -HOLDER_CONCENTRATION_PERCENT_EPSILON ||
    top10Raw > 100 + HOLDER_CONCENTRATION_PERCENT_EPSILON
  ) {
    return null;
  }

  const topPercents = sortedPercents
    .slice(0, Math.min(sortedPercents.length, HOLDER_CONCENTRATION_TOP_N))
    .map(clampPercent);
  return { topPercents, top10Percent: clampPercent(top10Raw) };
}

/**
 * Compute the Solana holder concentration for `mint` (total supply
 * denominator). Resolves `null` on every fail-open path — never throws.
 */
export async function computeHolderConcentration(
  rpc: HolderConcentrationRpc,
  mint: string,
): Promise<HolderConcentration | null> {
  try {
    const supply = await rpc.getTokenSupply(mint);
    const supplyAmount = parseAmount(supply?.amount);
    if (supplyAmount === null || supplyAmount <= 0n) return null;

    const largest = await rpc.getTokenLargestAccounts(mint);
    if (largest === null || largest.length === 0) return null;

    // Batch 1: ATA accounts -> decoded owner + amount.
    const ataAccounts = await rpc.getMultipleAccounts(
      largest.map((entry) => entry.address),
    );
    const merged = new Map<string, bigint>();
    for (let i = 0; i < largest.length; i += 1) {
      const bytes = readAccountBytes(ataAccounts[i]);
      if (bytes === null) continue;
      // Exclusion (i): mint AND owner zero (uninitialized). Must run
      // BEFORE the burn check — otherwise it masquerades as `1111…`.
      if (isUninitializedTokenAccount(bytes)) continue;
      const decoded = decodeTokenAccount(bytes);
      if (decoded === null || decoded.mint !== mint) continue;
      merged.set(
        decoded.owner,
        (merged.get(decoded.owner) ?? 0n) + decoded.amount,
      );
    }

    // Zero-amount wallets hold nothing and never render a 0.0 row.
    for (const [owner, amount] of [...merged.entries()]) {
      if (amount === 0n) merged.delete(owner);
    }
    // Exclusion (ii): the System Program address used as a holder is
    // ONE burn pattern; excluded BEFORE the wallet batch (no lookup).
    merged.delete(SYSTEM_PROGRAM_ID);

    // Batch 2: merged wallets (insertion order; exclusion data is the
    // answer, so it is paid even when the map is already empty).
    const owners = [...merged.entries()];
    const walletAccounts = await rpc.getMultipleAccounts(
      owners.map(([owner]) => owner),
    );

    const survivors: bigint[] = [];
    for (let i = 0; i < owners.length; i += 1) {
      const wallet = walletAccounts[i];
      // Exclusion (iii): on-chain-null wallet (e.g. the incinerator).
      if (wallet === null || wallet === undefined) continue;
      // Exclusion (iv): program-owned (pools/curves/PDAs/vaults). A
      // multisig falls here too — accepted false negative.
      if (wallet.owner !== SYSTEM_PROGRAM_ID) continue;
      survivors.push(owners[i][1]);
    }
    if (survivors.length === 0) return null;

    survivors.sort((a, b) => (a === b ? 0 : a > b ? -1 : 1));
    const percents = survivors.map(
      (amount) => (Number(amount) / Number(supplyAmount)) * 100,
    );
    return buildHolderConcentration(percents);
  } catch {
    return null;
  }
}
