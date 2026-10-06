import { Injectable } from '@nestjs/common';
import type {
  BatchAccountsClient,
  GetTokenLargestAccountsResult,
  GetTokenSupplyResult,
  SolanaAccountInfoValue,
} from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from 'launchpad/infrastructure/solana-pda';
import { base64ToBytes } from './codec-utils';
import { decodeMeteoraDbc, decodeMeteoraDlmm } from './meteora-pools.codec';
import { decodeOrcaWhirlpool } from './orca-whirlpool.codec';
import { decodePumpCurve } from './pump-bonding-curve.codec';
import {
  decodeRaydiumAmmV4,
  decodeRaydiumClmm,
  decodeRaydiumCpmm,
} from './raydium-pools.codec';
import {
  METAPLEX_TOKEN_METADATA_PROGRAM,
  METEORA_DLMM_PROGRAM,
  ORCA_WHIRLPOOL_PROGRAM,
  PUMP_FUN_PROGRAM,
  RAYDIUM_AMM_V4_PROGRAM,
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_CLMM_PROGRAM,
  METEORA_DBC_PROGRAM,
} from './solana-program-ids';
import {
  decodeMetadata,
  decodeMintAccount,
  decodeTokenAccount,
} from './token-accounts.codec';

/**
 * Lane S on-chain Solana reader (dexter plan todo 22).
 *
 * Reads pool state + token basics DIRECTLY from chain accounts via
 * the frozen Lane T `BatchAccountsClient` — no aggregators, no
 * indexer, no gRPC. Family dispatch is by account OWNER program
 * (observed on-chain), never by guess: CPMM and CLMM share the
 * `PoolState` discriminator, so the discriminator alone CANNOT
 * select the family.
 *
 * Field sources (explicit per the todo): price/liquidity legs come
 * from pool structs + vault token accounts + mint decimals;
 * supply/holders/metadata come from `getTokenSupply` /
 * `getTokenLargestAccounts` / the Metaplex metadata PDA, fetched in
 * ONE `Promise.all`. volume24h / ATH / trending / socials /
 * honeypot stay with the aggregators (later todo) — a pool view
 * with only fast fields is complete by design (NOT integrated into
 * the snapshot pipeline here; wiring is a later todo).
 *
 * Fail-open everywhere: unknown owner, short/truncated data,
 * missing vaults or mints, bad PDA input — all resolve `null`,
 * never throw outward.
 */

export type OnchainPoolFamily =
  | 'pump'
  | 'raydium-amm-v4'
  | 'raydium-cpmm'
  | 'raydium-clmm'
  | 'orca-whirlpool'
  | 'meteora-dlmm'
  | 'meteora-dbc';

export interface OnchainPoolLeg {
  readonly mint: string;
  readonly vault: string | null;
  readonly reserve: bigint;
  readonly decimals: number | null;
}

export interface OnchainPoolView {
  readonly poolAddress: string;
  readonly family: OnchainPoolFamily;
  readonly legs: readonly [OnchainPoolLeg, OnchainPoolLeg];
  /** Price of leg B in units of leg A (human, decimals-applied). */
  readonly priceBA: number | null;
  /** True when the curve reports finished/migrated (pump/DBC). */
  readonly migrated: boolean;
}

export interface OnchainTokenSupply {
  readonly amount: string;
  readonly decimals: number;
}

export interface OnchainHolderEntry {
  readonly address: string;
  readonly amount: string;
  readonly sharePercent: number | null;
}

export interface OnchainTokenBasics {
  readonly mint: string;
  readonly supply: OnchainTokenSupply | null;
  readonly holders: ReadonlyArray<OnchainHolderEntry> | null;
  readonly top10SharePercent: number | null;
  readonly metadata: {
    readonly name: string;
    readonly symbol: string;
    readonly uri: string;
  } | null;
}

export interface TokenSupplyClient {
  getTokenSupply(
    mintAddress: string,
  ): Promise<GetTokenSupplyResult['value'] | null>;
}

export interface TokenHoldersClient {
  getTokenLargestAccounts(
    mintAddress: string,
  ): Promise<GetTokenLargestAccountsResult['value'] | null>;
}

export interface OnchainSolanaReader {
  getPoolView(
    poolAddress: string,
    mintHint?: string,
  ): Promise<OnchainPoolView | null>;
  getTokenBasics(mint: string): Promise<OnchainTokenBasics | null>;
}

const Q64 = 2 ** 64;

function sqrtX64ToFloat(sqrtPrice: bigint): number | null {
  if (sqrtPrice <= 0n) return null;
  const asNumber = Number(sqrtPrice);
  if (!Number.isFinite(asNumber)) return null;
  const ratio = asNumber / Q64;
  return ratio * ratio;
}

function applyDecimals(
  raw: number,
  decimalsA: number | null,
  decimalsB: number | null,
): number | null {
  if (decimalsA === null || decimalsB === null) return null;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw * 10 ** (decimalsA - decimalsB);
}

@Injectable()
export class OnchainSolanaReaderService implements OnchainSolanaReader {
  public constructor(
    private readonly accounts: BatchAccountsClient,
    private readonly supply: TokenSupplyClient,
    private readonly holders: TokenHoldersClient,
  ) {}

  public async getPoolView(
    poolAddress: string,
    mintHint?: string,
  ): Promise<OnchainPoolView | null> {
    try {
      const fetched = await this.accounts.getMultiple([poolAddress]);
      const pool = fetched[0] ?? null;
      if (pool === null) return null;
      const bytes = base64ToBytes(pool.data[0]);
      if (bytes === null) return null;
      switch (pool.owner) {
        case PUMP_FUN_PROGRAM:
          return this.pumpView(poolAddress, bytes, mintHint ?? null);
        case RAYDIUM_AMM_V4_PROGRAM:
          return this.vaultView(poolAddress, bytes, 'raydium-amm-v4');
        case RAYDIUM_CPMM_PROGRAM:
          return this.vaultView(poolAddress, bytes, 'raydium-cpmm');
        case RAYDIUM_CLMM_PROGRAM:
          return this.sqrtView(poolAddress, bytes, 'raydium-clmm');
        case ORCA_WHIRLPOOL_PROGRAM:
          return this.sqrtView(poolAddress, bytes, 'orca-whirlpool');
        case METEORA_DLMM_PROGRAM:
          return this.dlmmView(poolAddress, bytes);
        case METEORA_DBC_PROGRAM:
          return this.dbcView(poolAddress, bytes);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  public async getTokenBasics(
    mint: string,
  ): Promise<OnchainTokenBasics | null> {
    try {
      let metadataPda: string | null = null;
      try {
        metadataPda = findProgramAddress(
          [
            utf8Seed('metadata'),
            addressToBytes(METAPLEX_TOKEN_METADATA_PROGRAM),
            addressToBytes(mint),
          ],
          METAPLEX_TOKEN_METADATA_PROGRAM,
        ).address;
      } catch {
        metadataPda = null;
      }
      const [supply, holders, metaAccounts] = await Promise.all([
        this.supply.getTokenSupply(mint).catch(() => null),
        this.holders.getTokenLargestAccounts(mint).catch(() => null),
        metadataPda === null
          ? Promise.resolve([])
          : this.accounts
              .getMultiple([metadataPda])
              .catch((): ReadonlyArray<SolanaAccountInfoValue | null> => []),
      ]);
      if (supply === null && holders === null) {
        const metaOnly =
          metadataPda !== null ? (metaAccounts[0] ?? null) : null;
        if (metaOnly === null) return null;
      }
      const metaBytes =
        metadataPda === null
          ? null
          : (metaAccounts[0] ?? null) === null
            ? null
            : base64ToBytes(
                (metaAccounts[0] as SolanaAccountInfoValue).data[0],
              );
      const meta = metaBytes === null ? null : decodeMetadata(metaBytes, mint);
      const holderEntries = toHolderEntries(holders, supply?.amount ?? null);
      return {
        mint,
        supply:
          supply === null || supply === undefined
            ? null
            : { amount: supply.amount, decimals: supply.decimals },
        holders: holderEntries,
        top10SharePercent: topShare(holderEntries, 10),
        metadata:
          meta === null
            ? null
            : { name: meta.name, symbol: meta.symbol, uri: meta.uri },
      };
    } catch {
      return null;
    }
  }

  private async pumpView(
    poolAddress: string,
    bytes: Uint8Array,
    mintHint: string | null,
  ): Promise<OnchainPoolView | null> {
    const curve = decodePumpCurve(bytes);
    if (curve === null || mintHint === null || mintHint === '') {
      return null;
    }
    const decimals = await this.mintDecimals(mintHint);
    if (decimals === null) return null;
    const solPerToken =
      Number(curve.virtualSolReserves) /
      1e9 /
      (Number(curve.virtualTokenReserves) / 10 ** decimals);
    const legs = [
      {
        mint: mintHint,
        vault: null,
        reserve: curve.virtualTokenReserves,
        decimals,
      },
      {
        mint: 'So11111111111111111111111111111111111111112',
        vault: null,
        reserve: curve.virtualSolReserves,
        decimals: 9,
      },
    ] as const;
    return {
      poolAddress,
      family: 'pump',
      legs,
      priceBA:
        Number.isFinite(solPerToken) && solPerToken > 0 ? solPerToken : null,
      migrated: false,
    };
  }

  private async vaultView(
    poolAddress: string,
    bytes: Uint8Array,
    family: 'raydium-amm-v4' | 'raydium-cpmm',
  ): Promise<OnchainPoolView | null> {
    const decoded =
      family === 'raydium-amm-v4'
        ? decodeRaydiumAmmV4(bytes)
        : decodeRaydiumCpmm(bytes);
    if (decoded === null) return null;
    const fetched = await this.accounts
      .getMultiple([
        decoded.vaultA,
        decoded.vaultB,
        decoded.mintA,
        decoded.mintB,
      ])
      .catch(() => []);
    const legA = await this.vaultLeg(
      decoded.mintA,
      decoded.vaultA,
      fetched[0] ?? null,
      fetched[2] ?? null,
      decoded.mintDecimalsA,
    );
    const legB = await this.vaultLeg(
      decoded.mintB,
      decoded.vaultB,
      fetched[1] ?? null,
      fetched[3] ?? null,
      decoded.mintDecimalsB,
    );
    if (legA === null || legB === null) return null;
    return {
      poolAddress,
      family,
      legs: [legA, legB],
      priceBA: ratioPrice(legA, legB),
      migrated: false,
    };
  }

  private async sqrtView(
    poolAddress: string,
    bytes: Uint8Array,
    family: 'raydium-clmm' | 'orca-whirlpool',
  ): Promise<OnchainPoolView | null> {
    const decoded =
      family === 'raydium-clmm'
        ? decodeRaydiumClmm(bytes)
        : decodeOrcaWhirlpool(bytes);
    if (decoded === null) return null;
    const fetched = await this.accounts
      .getMultiple([
        decoded.vaultA,
        decoded.vaultB,
        decoded.mintA,
        decoded.mintB,
      ])
      .catch(() => []);
    const legA = await this.vaultLeg(
      decoded.mintA,
      decoded.vaultA,
      fetched[0] ?? null,
      fetched[2] ?? null,
      decoded.mintDecimalsA,
    );
    const legB = await this.vaultLeg(
      decoded.mintB,
      decoded.vaultB,
      fetched[1] ?? null,
      fetched[3] ?? null,
      decoded.mintDecimalsB,
    );
    if (legA === null || legB === null) return null;
    const raw = sqrtX64ToFloat(decoded.sqrtPriceX64);
    const priceBA =
      raw === null
        ? ratioPrice(legA, legB)
        : (applyDecimals(raw, legA.decimals, legB.decimals) ??
          ratioPrice(legA, legB));
    return {
      poolAddress,
      family,
      legs: [legA, legB],
      priceBA,
      migrated: false,
    };
  }

  private async dlmmView(
    poolAddress: string,
    bytes: Uint8Array,
  ): Promise<OnchainPoolView | null> {
    const decoded = decodeMeteoraDlmm(bytes);
    if (decoded === null) return null;
    const fetched = await this.accounts
      .getMultiple([
        decoded.reserveX,
        decoded.reserveY,
        decoded.tokenXMint,
        decoded.tokenYMint,
      ])
      .catch(() => []);
    const legA = await this.vaultLeg(
      decoded.tokenXMint,
      decoded.reserveX,
      fetched[0] ?? null,
      fetched[2] ?? null,
      null,
    );
    const legB = await this.vaultLeg(
      decoded.tokenYMint,
      decoded.reserveY,
      fetched[1] ?? null,
      fetched[3] ?? null,
      null,
    );
    if (legA === null || legB === null) return null;
    const spot = Math.pow(
      1 + decoded.binStep / 10000,
      Number(decoded.activeId),
    );
    const priceBA =
      applyDecimals(spot, legA.decimals, legB.decimals) ??
      ratioPrice(legA, legB);
    return {
      poolAddress,
      family: 'meteora-dlmm',
      legs: [legA, legB],
      priceBA,
      migrated: false,
    };
  }

  private async dbcView(
    poolAddress: string,
    bytes: Uint8Array,
  ): Promise<OnchainPoolView | null> {
    const decoded = decodeMeteoraDbc(bytes);
    if (decoded === null) return null;
    const quoteMint = await this.vaultMint(decoded.quoteVault);
    const baseMintDec = await this.mintDecimals(decoded.baseMint);
    const quoteMintDec =
      quoteMint === null ? 9 : await this.mintDecimals(quoteMint);
    const legA: OnchainPoolLeg = {
      mint: decoded.baseMint,
      vault: decoded.baseVault,
      reserve: decoded.baseReserve,
      decimals: baseMintDec,
    };
    const legB: OnchainPoolLeg = {
      mint: quoteMint ?? '',
      vault: decoded.quoteVault,
      reserve: decoded.quoteReserve,
      decimals: quoteMintDec,
    };
    const priceBA =
      applyDecimals(
        Number(decoded.quoteReserve) / Number(decoded.baseReserve),
        baseMintDec,
        quoteMintDec,
      ) ?? ratioPrice(legA, legB);
    return {
      poolAddress,
      family: 'meteora-dbc',
      legs: [legA, legB],
      priceBA,
      migrated: decoded.isMigrated,
    };
  }

  private async vaultMint(vault: string): Promise<string | null> {
    try {
      const fetched = await this.accounts.getMultiple([vault]);
      const raw = fetched[0] ?? null;
      if (raw === null) return null;
      const bytes = base64ToBytes(raw.data[0]);
      if (bytes === null) return null;
      return decodeTokenAccount(bytes)?.mint ?? null;
    } catch {
      return null;
    }
  }

  private async mintDecimals(mint: string | null): Promise<number | null> {
    try {
      if (mint === null || mint === '') return null;
      const fromSupply = await this.supply
        .getTokenSupply(mint)
        .catch(() => null);
      if (fromSupply !== null && fromSupply !== undefined) {
        return fromSupply.decimals;
      }
      const fetched = await this.accounts.getMultiple([mint]);
      const raw = fetched[0] ?? null;
      if (raw === null) return null;
      const bytes = base64ToBytes(raw.data[0]);
      if (bytes === null) return null;
      return decodeMintAccount(bytes)?.decimals ?? null;
    } catch {
      return null;
    }
  }

  private async vaultLeg(
    mint: string,
    vault: string,
    vaultRaw: SolanaAccountInfoValue | null,
    mintRaw: SolanaAccountInfoValue | null,
    structDecimals: number | null,
  ): Promise<OnchainPoolLeg | null> {
    const vaultBytes =
      vaultRaw === null ? null : base64ToBytes(vaultRaw.data[0]);
    const vaultDecoded =
      vaultBytes === null ? null : decodeTokenAccount(vaultBytes);
    if (vaultDecoded === null) return null;
    if (vaultDecoded.mint !== mint) return null;
    const mintBytes = mintRaw === null ? null : base64ToBytes(mintRaw.data[0]);
    const mintDecoded =
      mintBytes === null ? null : decodeMintAccount(mintBytes);
    const decimals =
      mintDecoded?.decimals ??
      structDecimals ??
      (await this.mintDecimals(mint));
    return { mint, vault, reserve: vaultDecoded.amount, decimals };
  }
}

function ratioPrice(legA: OnchainPoolLeg, legB: OnchainPoolLeg): number | null {
  if (
    legA.decimals === null ||
    legB.decimals === null ||
    legA.reserve <= 0n ||
    legB.reserve <= 0n
  ) {
    return null;
  }
  return (
    Number(legB.reserve) /
    10 ** legB.decimals /
    (Number(legA.reserve) / 10 ** legA.decimals)
  );
}

function toHolderEntries(
  holders: GetTokenLargestAccountsResult['value'] | null | undefined,
  supplyAmount: string | null | undefined,
): ReadonlyArray<OnchainHolderEntry> | null {
  if (holders === null || holders === undefined) return null;
  const supply =
    supplyAmount === null || supplyAmount === undefined
      ? null
      : BigInt(supplyAmount);
  return holders.map((entry) => ({
    address: entry.address,
    amount: entry.amount,
    sharePercent:
      supply === null || supply === 0n
        ? null
        : (Number(BigInt(entry.amount)) / Number(supply)) * 100,
  }));
}

function topShare(
  holders: ReadonlyArray<OnchainHolderEntry> | null,
  top: number,
): number | null {
  if (holders === null) return null;
  let acc = 0;
  let count = 0;
  for (const entry of holders) {
    if (count >= top) break;
    if (entry.sharePercent === null) return null;
    acc += entry.sharePercent;
    count += 1;
  }
  return acc;
}
