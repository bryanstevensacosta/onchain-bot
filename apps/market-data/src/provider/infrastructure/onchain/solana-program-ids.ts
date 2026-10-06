import { createHash } from 'node:crypto';
import {
  METEORA_DBC_PROGRAM,
  PUMP_FUN_PROGRAM,
} from 'launchpad/domain/launchpad-table';

/**
 * Pinned Solana program IDs for the Lane S on-chain readers
 * (dexter plan todo 22).
 *
 * Sourcing rule (never from memory):
 * - `PUMP_FUN_PROGRAM` + `METEORA_DBC_PROGRAM` are re-exported from
 *   the R1-ratified `launchpad-table.ts` (dexter-launchpad Wave 1).
 * - Every other pool program below was OBSERVED ON-CHAIN as the
 *   `owner` of live pool accounts (captured 2026-10-05, public RPC)
 *   AND cross-checked against the program's published source:
 *   Raydium layouts = `raydium-io/raydium-sdk-V2`
 *   (`liquidity/layout.ts`, `cpmm/layout.ts`, `clmm/layout.ts`);
 *   Whirlpool layout = `orca-so/whirlpools`
 *   (`programs/whirlpool/src/state/whirlpool.rs`, LEN 653);
 *   DLMM `address` + LbPair shape = `MeteoraAg/dlmm-sdk`
 *   (`idls/dlmm.json`); DBC `address` + VirtualPool shape =
 *   `MeteoraAg/dynamic-bonding-curve-sdk` (DBC IDL).
 * - `METAPLEX_TOKEN_METADATA_PROGRAM` =
 *   `metaplex.com/docs/official-links` (the commonly mistyped
 *   `...8bt0v` tail is NOT valid base58; the registered ID ends
 *   `...8bt518x1s`).
 * - `SPL_TOKEN_PROGRAM` / `TOKEN_2022_PROGRAM` were observed as the
 *   `owner` of live vault/mint accounts in the same capture round.
 *
 * Two corrections the on-chain check caught (documented, not assumed):
 * - Raydium CLMM lives at `CAMMCzo5...` (the legacy `devi51m...`
 *   ID is superseded — DexScreener-labeled CLMM pools resolve here).
 * - Meteora DLMM lives at `...VaPwxo` (the `...UWYj9` string from
 *   memory is not even valid base58 — the IDL `address` agrees
 *   with the observed owner byte-for-byte).
 * - Raydium CPMM lives at `...QB5qKP1C` (same story: the
 *   `...xPZrjox` string never appears on-chain; DexScreener-labeled
 *   CPMM pools resolve here).
 */

// Launchpad programs (R1 pins, re-exported — single source of truth).
export { PUMP_FUN_PROGRAM, METEORA_DBC_PROGRAM };

/** Raydium Liquidity Pool V4 (classic AMM). Observed + SDK layout. */
export const RAYDIUM_AMM_V4_PROGRAM =
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

/** Raydium CPMM. Observed + `CpmmPoolInfoLayout` (raydium-sdk-V2). */
export const RAYDIUM_CPMM_PROGRAM =
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

/** Raydium CLMM (current). Observed + `PoolInfoLayout` (raydium-sdk-V2). */
export const RAYDIUM_CLMM_PROGRAM =
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

/** Orca Whirlpool. Observed + `state/whirlpool.rs` (LEN 653). */
export const ORCA_WHIRLPOOL_PROGRAM =
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

/** Meteora DLMM. Observed + `dlmm-sdk/idls/dlmm.json` address. */
export const METEORA_DLMM_PROGRAM =
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

/** Metaplex Token Metadata (metaplex.com official links). Observed. */
export const METAPLEX_TOKEN_METADATA_PROGRAM =
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

/** SPL Token (classic). Observed on live vault accounts. */
export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** SPL Token-2022. Observed on live mints (extensions live past 82B). */
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnAAvKmd1qT6M';

/** Wrapped SOL mint (quote leg of most Solana pools). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Anchor 8-byte account discriminator: `sha256("account:<Name>")`
 * truncated to 8 bytes. Computed (Anchor spec), never memorized —
 * every value below was verified against captured mainnet bytes:
 * - BondingCurve `17b7f83760d8ac60` (pump curve, 151B)
 * - PoolState `f7ede3f5d7c3de46` (CPMM 637B AND CLMM 1544B —
 *   both programs name the account `PoolState`; the OWNER
 *   program, not the discriminator, selects the family)
 * - Whirlpool `3f95d10ce1806309` (653B)
 * - LbPair `210b3162b565b10d` (DLMM 904B, == IDL discriminator)
 * - VirtualPool `d5e005d16245775c` (DBC 424B, == IDL discriminator)
 */
export function anchorDiscriminator(accountName: string): Uint8Array {
  return Uint8Array.from(
    createHash('sha256')
      .update(`account:${accountName}`)
      .digest()
      .subarray(0, 8),
  );
}

export function discriminatorEquals(
  bytes: Uint8Array,
  accountName: string,
): boolean {
  if (bytes.length < 8) return false;
  const expected = anchorDiscriminator(accountName);
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== expected[i]) return false;
  }
  return true;
}
