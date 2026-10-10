import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc/solana-rpc.service';
import type { LaunchpadInfo } from '../domain/launchpad-info';
import type { LaunchpadDetectorPort } from '../domain/launchpad-detector.port';
import {
  BANKR_API_BASE,
  BONKFUN_PLATFORM_CONFIGS,
  BOOP_PROGRAM,
  EVM_CHAIN_TRANSPORTS,
  EVM_FACTORY_SETS,
  EVM_LAUNCHPAD_ORDER,
  EVM_RECEIPT_EXCLUDED,
  HEAVEN_POOL_STATE_URL,
  HEAVEN_PROGRAM,
  MINTCLUB_API_BASE,
  MOONIT_PROGRAM,
  PONS_LAUNCHPAD_BASE,
  PUMP_FUN_PROGRAM,
  RAYDIUM_LAUNCHLAB_PROGRAM,
  STONKFUN_PLATFORM_CONFIGS,
  USDC_MINT,
  WSOL_MINT,
  launchpadInfo,
} from '../domain/launchpad-table';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from '../infrastructure/solana-pda';

const HTTP_TIMEOUT_MS = 8_000;
const DETECTOR_TIMEOUT_MS = 10_000;

const SOLANA_CHAINS = new Set(['solana', 'sol']);

const EVM_CHAIN_ALIASES: Record<string, string> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  bnb: 'bsc',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  'arbitrum-one': 'arbitrum',
  matic: 'polygon',
  polygon: 'polygon',
  robinhood: 'robinhood',
  optimism: 'optimism',
  avalanche: 'avalanche',
};

const MINTCLUB_NUMERIC_CHAIN: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  robinhood: 4663,
};

const BANKR_CHAINS = new Set(['base', 'robinhood']);

/** Chains where the Pons SSR registry leg may fire (Pons is Robinhood-native). */
const PONS_CHAINS = new Set(['robinhood']);

const RECEIPT_MATCH_ORDER = EVM_LAUNCHPAD_ORDER.filter(
  (id) => !(id in EVM_RECEIPT_EXCLUDED),
);

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('launchpad timeout')), ms);
  });
  return Promise.race([work, guard]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * LaunchpadDetector (dexter-launchpad Wave 1, Lane D).
 *
 * `detectLaunchpad(chain, address)` — and nothing else — resolves the
 * ORIGIN launchpad via the ratified ordered strategy array (specific
 * brand BEFORE generic infra, FIRST match wins). Solana legs batch
 * every PDA candidate into ONE `getMultipleAccounts` call; EVM legs
 * try cheap view/API legs first, then ONE Blockscout creation lookup
 * + ONE receipt fetch matched against the factory table in order.
 * Every external call carries a timeout; anything unknown, slow, or
 * failed resolves to `null` — this service never throws outward.
 */
@Injectable()
export class LaunchpadDetectorService implements LaunchpadDetectorPort {
  private readonly logger = new Logger(LaunchpadDetectorService.name);

  public constructor(private readonly solanaRpc: SolanaRpcService) {}

  public async detectLaunchpad(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    try {
      return await withTimeout(
        this.detectInner((chain ?? '').trim(), (address ?? '').trim()),
        DETECTOR_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.debug(
        `detectLaunchpad null (chain=${chain}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async detectInner(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    if (chain === '' || address === '') return null;
    const normalized = chain.toLowerCase();
    if (SOLANA_CHAINS.has(normalized)) {
      return this.detectSolana(address);
    }
    const evm = EVM_CHAIN_ALIASES[normalized] ?? null;
    if (evm === null) return null;
    return this.detectEvm(evm, address);
  }

  private async detectSolana(mint: string): Promise<LaunchpadInfo | null> {
    let mintBytes: Uint8Array;
    try {
      mintBytes = addressToBytes(mint);
    } catch {
      return null;
    }
    let pumpPda: string;
    let launchlabWsol: string;
    let launchlabUsdc: string;
    let moonitCurve: string;
    let boopCurve: string;
    try {
      pumpPda = findProgramAddress(
        [utf8Seed('bonding-curve'), mintBytes],
        PUMP_FUN_PROGRAM,
      ).address;
      launchlabWsol = findProgramAddress(
        [utf8Seed('pool'), mintBytes, addressToBytes(WSOL_MINT)],
        RAYDIUM_LAUNCHLAB_PROGRAM,
      ).address;
      launchlabUsdc = findProgramAddress(
        [utf8Seed('pool'), mintBytes, addressToBytes(USDC_MINT)],
        RAYDIUM_LAUNCHLAB_PROGRAM,
      ).address;
      moonitCurve = findProgramAddress(
        [utf8Seed('token'), mintBytes],
        MOONIT_PROGRAM,
      ).address;
      boopCurve = findProgramAddress(
        [utf8Seed('bonding_curve'), mintBytes],
        BOOP_PROGRAM,
      ).address;
    } catch {
      return null;
    }
    const [batch, heaven] = await Promise.all([
      this.solanaRpc.getMultipleAccounts([
        pumpPda,
        launchlabWsol,
        launchlabUsdc,
        moonitCurve,
        boopCurve,
      ]),
      this.detectHeaven(mint),
    ]);
    if (batch !== null) {
      const [pump, wsol, usdc] = batch;
      if (pump !== null && pump !== undefined) {
        return launchpadInfo('pump-fun', 'solana', mint);
      }
      const pools = [wsol, usdc].filter(
        (entry) => entry !== null && entry !== undefined,
      );
      for (const pool of pools) {
        const brand = this.launchlabBrand(pool?.data?.[0] ?? '');
        if (brand !== null) {
          return launchpadInfo(brand, 'solana', mint);
        }
      }
      if (pools.length > 0) {
        return launchpadInfo('raydium-launchlab', 'solana', mint);
      }
      const moonit = batch[3];
      if (moonit !== null && moonit !== undefined) {
        return launchpadInfo('moonit', 'solana', mint);
      }
      const boop = batch[4];
      if (boop !== null && boop !== undefined) {
        return launchpadInfo('boop', 'solana', mint);
      }
    }
    if (heaven) {
      return launchpadInfo('heaven', 'solana', mint);
    }
    return null;
  }

  private launchlabBrand(poolDataBase64: string): string | null {
    if (poolDataBase64 === '') return null;
    let raw: Uint8Array;
    try {
      raw = Uint8Array.from(Buffer.from(poolDataBase64, 'base64'));
    } catch {
      return null;
    }
    for (const config of BONKFUN_PLATFORM_CONFIGS) {
      try {
        if (containsBytes(raw, addressToBytes(config))) return 'bonk-fun';
      } catch {
        continue;
      }
    }
    for (const config of STONKFUN_PLATFORM_CONFIGS) {
      try {
        if (containsBytes(raw, addressToBytes(config))) return 'stonkfun';
      } catch {
        continue;
      }
    }
    return null;
  }

  private async detectHeaven(mint: string): Promise<boolean> {
    try {
      const { data } = await axios.post(
        HEAVEN_POOL_STATE_URL,
        { program_id: HEAVEN_PROGRAM, mint },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: HTTP_TIMEOUT_MS,
        },
      );
      const body = data as { data?: unknown };
      return (
        data !== null &&
        typeof data === 'object' &&
        typeof body.data === 'string' &&
        body.data.length > 0
      );
    } catch {
      return false;
    }
  }

  private async detectEvm(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
    if (BANKR_CHAINS.has(chain)) {
      if (await this.detectBankr(address)) {
        return launchpadInfo('bankr', chain, address);
      }
    }
    const mintclub = await this.detectMintclub(chain, address);
    if (mintclub !== null) return mintclub;
    if (PONS_CHAINS.has(chain)) {
      if (await this.detectPons(address)) {
        return launchpadInfo('pons', chain, address);
      }
    }
    const factory = await this.detectFactoryTo(chain, address);
    if (factory === null) return null;
    return launchpadInfo(factory, chain, address);
  }

  private async detectBankr(address: string): Promise<boolean> {
    try {
      const { status, data } = await axios.get(
        `${BANKR_API_BASE}/public/doppler/token-fees/${address}`,
        { timeout: HTTP_TIMEOUT_MS, validateStatus: () => true },
      );
      if (status !== 200 || data === null || data === undefined) return false;
      return JSON.stringify(data).toLowerCase().includes(address.toLowerCase());
    } catch {
      return false;
    }
  }

  private async detectMintclub(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    const numeric = MINTCLUB_NUMERIC_CHAIN[chain] ?? null;
    if (numeric === null) return null;
    try {
      const { status, data } = await axios.get(
        `${MINTCLUB_API_BASE}/api/tokens/byAddress/${numeric}/${address}`,
        { timeout: HTTP_TIMEOUT_MS, validateStatus: () => true },
      );
      if (status !== 200 || data === null || typeof data !== 'object') {
        return null;
      }
      const record = data as { address?: unknown; symbol?: unknown };
      if (
        typeof record.address !== 'string' ||
        record.address.toLowerCase() !== address.toLowerCase()
      ) {
        return null;
      }
      if (typeof record.symbol === 'string' && record.symbol !== '') {
        return {
          id: 'mintclub',
          name: 'Mint Club',
          url: `${MINTCLUB_API_BASE}/token/${chain}/${record.symbol}`,
        };
      }
      return launchpadInfo('mintclub', chain, address);
    } catch {
      return null;
    }
  }

  /**
   * Pons SSR registry leg (plan todos 26/34): `GET <base>/launchpad/<address>`
   * is server-rendered — a Pons-launched token answers a token-specific
   * `<title>NAME (SYM) | Pons</title>` with an indexing robots tag
   * (`index, follow`), while unknown addresses get the generic shell
   * `<title>Token | Pons</title>` with `noindex, nofollow` (verified live
   * 2026-10-10: NYMA 0x968B… vs 0x…dead). Both conditions must hold
   * (token-specific title + indexable robots), so a site redesign fails
   * open to null instead of false-positive. NOTE 2026-10-10: the todo-26
   * shape (`· pons` suffix + canonical link) is retired — the redesign
   * answers `| Pons` titles on BOTH pages and ships a canonical carrying
   * the address even on the generic shell, so neither discriminates now.
   * Keyless, single GET, robinhood-scoped by the caller.
   */
  private async detectPons(address: string): Promise<boolean> {
    try {
      const { status, data } = await axios.get(
        `${PONS_LAUNCHPAD_BASE}/launchpad/${address}`,
        { timeout: HTTP_TIMEOUT_MS, validateStatus: () => true },
      );
      if (status !== 200 || typeof data !== 'string') return false;
      const title = /<title>([^<]*)<\/title>/i.exec(data)?.[1]?.trim() ?? '';
      if (!/\| Pons$/.test(title) || title === 'Token | Pons') {
        return false;
      }
      // Robots-index guard: launched tokens are indexed, the generic
      // shell is noindex — a second independent signal so a title-only
      // coincidence cannot false-positive.
      const robots =
        /<meta[^>]*name=["']robots["'][^>]*>/i.exec(data)?.[0] ?? '';
      const content = /content=["']([^"']*)["']/i.exec(robots)?.[1] ?? '';
      if (content === '' || /noindex/i.test(content)) return false;
      return /\bindex\b/i.test(content);
    } catch {
      return false;
    }
  }

  private async detectFactoryTo(
    chain: string,
    address: string,
  ): Promise<string | null> {
    const transport = EVM_CHAIN_TRANSPORTS[chain] ?? null;
    if (transport === null || transport.blockscoutUrl === null) return null;
    const txHash = await this.creationTxHash(transport.blockscoutUrl, address);
    if (txHash === null) return null;
    const to = await this.receiptTo(transport.rpcUrl, txHash);
    if (to === null) return null;
    for (const id of RECEIPT_MATCH_ORDER) {
      const set = EVM_FACTORY_SETS[id] ?? null;
      if (set === null) continue;
      if (!set.chains.includes(chain)) continue;
      if (set.factories.some((factory) => factory.toLowerCase() === to)) {
        return id;
      }
    }
    return null;
  }

  private async creationTxHash(
    blockscoutUrl: string,
    address: string,
  ): Promise<string | null> {
    try {
      const { status, data } = await axios.get(blockscoutUrl + '/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: address,
        },
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (status !== 200 || data === null || typeof data !== 'object') {
        return null;
      }
      const result = (data as { result?: unknown }).result;
      if (!Array.isArray(result) || result.length === 0) return null;
      const entry = result[0] as {
        contractAddress?: unknown;
        txHash?: unknown;
      };
      if (
        typeof entry.contractAddress !== 'string' ||
        entry.contractAddress.toLowerCase() !== address.toLowerCase() ||
        typeof entry.txHash !== 'string' ||
        entry.txHash === ''
      ) {
        return null;
      }
      return entry.txHash;
    } catch {
      return null;
    }
  }

  private async receiptTo(
    rpcUrl: string,
    txHash: string,
  ): Promise<string | null> {
    try {
      const { status, data } = await axios.post(
        rpcUrl,
        {
          jsonrpc: '2.0',
          id: 'launchpad-detector',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: HTTP_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );
      if (status !== 200 || data === null || typeof data !== 'object') {
        return null;
      }
      const result = (data as { result?: unknown }).result as {
        to?: unknown;
      } | null;
      if (result === null || typeof result.to !== 'string') return null;
      return result.to.toLowerCase();
    } catch {
      return null;
    }
  }
}
