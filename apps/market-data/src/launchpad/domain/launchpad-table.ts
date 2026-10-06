import type { LaunchpadInfo } from './launchpad-info';

/**
 * Ratified detection table (dexter-launchpad Wave 1, Lane D).
 *
 * Executable form of `.omo/notepads/dexter-launchpad-r1.md` §5 + §8
 * (RATIFIED is normative): an ORDERED array, specific-brand BEFORE
 * generic-infra, FIRST match wins. Collapse-as-data: infra riders
 * without a resolved marker set (empty allowlists below) never fire
 * and fall through to their infra row — matching Rick's generic
 * display — instead of hiding behind if-chains.
 *
 * Source per constant is cited inline. Program IDs and factory
 * addresses come from the R1 table, never from memory. Rows the R1
 * gate sent to BACKLOG (gofundmeme, grafun, flap) and the EXCLUDED
 * row (daos-fun) have no entry here; Bags has no row (collapses to
 * `meteora-dbc` per §8.1).
 *
 * URL rule (§8.3): rows with a verified per-token page use it;
 * rows with TBD patterns use the defined.fi fallback until an
 * intake session surfaces the canonical form. Never any `?ref=`.
 */

export const PUMP_FUN_PROGRAM =
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const METEORA_DBC_PROGRAM =
  'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const RAYDIUM_LAUNCHLAB_PROGRAM =
  'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
export const MOONIT_PROGRAM =
  'MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG';
export const BOOP_PROGRAM =
  'boop8hVGQGqehUK2iVEMEnMrL5RbjywRzHKBmBE7ry4';
export const HEAVEN_PROGRAM =
  'HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o';

/** wSOL mint (repo-grounded: gateway-market-data-snapshot.spec.ts). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/** Canonical SPL USDC mint (existence-verified live in Wave-1 QA). */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * StonkFun platform configs: reward launches + standard launches.
 * Both carry the name `StonkFun` on-chain
 * (source: Bitquery StonkFun API page; R1 §1.13 pins the first).
 */
export const STONKFUN_PLATFORM_CONFIGS: ReadonlyArray<string> = [
  '6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt',
  '4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7',
];

/**
 * BONK.fun platform config: TBD Wave 1 (R1 §1.4). Empty = the
 * `bonk-fun` strategy never fires and LaunchLab pools fall through
 * to generic `raydium-launchlab` (§5 collapse rule). Partner configs
 * enter via the intake rule (owner address + Rick block).
 */
export const BONKFUN_PLATFORM_CONFIGS: ReadonlyArray<string> = [];

/**
 * Meteora DBC partner configs (Believe / Jupiter Studio / jups.fun
 * markers, R1 §§1.8/1.10/1.11): TBD via fixture pools. Empty = those
 * brand strategies never fire; pools fall through to `meteora-dbc`.
 * NB: the DBC pool PDA itself is config-derived (SDK-verified
 * `deriveDbcPoolAddress(quoteMint, baseMint, config)`, seeds
 * `["pool", config, sortedMintA, sortedMintB]`), so mint-only
 * derivation is impossible without a known config — the allowlist
 * IS the detection leg, not an optimization.
 */
export const METEORA_DBC_KNOWN_CONFIGS: ReadonlyArray<string> = [];

/**
 * Believe deployer wallets (R1 §1.10 distinguisher): TBD from a
 * fixture pool. Empty = `believe` never fires (collapses to
 * `meteora-dbc`, itself config-gated above).
 */
export const BELIEVE_DEPLOYERS: ReadonlyArray<string> = [];

export function definedFiFallback(chain: string, address: string): string {
  return `https://defined.fi/token/${chain}/${address}`;
}

export interface LaunchpadRow {
  readonly id: string;
  readonly name: string;
  readonly buildUrl: (chain: string, address: string) => string;
}

/** Solana strategy order: R1 §5 verbatim (1-9; 10 never collapses in). */
export const SOLANA_LAUNCHPAD_ORDER: ReadonlyArray<string> = [
  'pump-fun',
  'bonk-fun',
  'stonkfun',
  'raydium-launchlab',
  'heaven',
  'boop',
  'moonit',
  'believe',
  'jupiter-studio',
  'jups-fun',
  'meteora-dbc',
];

export const SOLANA_LAUNCHPAD_ROWS: Record<string, LaunchpadRow> = {
  'pump-fun': {
    id: 'pump-fun',
    name: 'Pump.fun',
    buildUrl: (_chain, address) => `https://pump.fun/coin/${address}`,
  },
  'bonk-fun': {
    id: 'bonk-fun',
    name: 'BONK.fun',
    buildUrl: (_chain, address) => `https://www.bonk.fun/token/${address}`,
  },
  stonkfun: {
    id: 'stonkfun',
    name: 'StonkFun',
    buildUrl: (_chain, address) =>
      `https://www.stonkfun.xyz/token/${address}`,
  },
  'raydium-launchlab': {
    id: 'raydium-launchlab',
    name: 'Raydium LaunchLab',
    buildUrl: (_chain, address) =>
      `https://raydium.io/launchpad/token/?mint=${address}`,
  },
  heaven: {
    id: 'heaven',
    name: 'Heaven',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  boop: {
    id: 'boop',
    name: 'Boop.fun',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  moonit: {
    id: 'moonit',
    name: 'Moonit',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  believe: {
    id: 'believe',
    name: 'Believe',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  'jupiter-studio': {
    id: 'jupiter-studio',
    name: 'Jupiter Studio',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  'jups-fun': {
    id: 'jups-fun',
    name: 'jups.fun',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  'meteora-dbc': {
    id: 'meteora-dbc',
    name: 'Meteora DBC',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
};

/** EVM strategy order: R1 §5 (bankr BEFORE clanker/Doppler-generic). */
export const EVM_LAUNCHPAD_ORDER: ReadonlyArray<string> = [
  'bankr',
  'clanker',
  'pons',
  'four-meme',
  'zora',
  'flaunch',
  'openserv',
  'mintclub',
  'virtuals',
  'pinksale',
  'dxsale',
];

/**
 * Rows excluded from receipt-`to` factory matching, with the reason.
 * pinksale/dxsale are presale-pattern rows (per-sale contracts, no
 * factory): PYRD's own creation receipt carries `to: null`
 * (contract-creation tx, `contractFactory: ""` on Blockscout) —
 * factory-set inclusion would be semantically wrong. Evidence:
 * `.omo/evidence/task-dex-launchpad-detector-fix.log` (probes P1-P4).
 * Both rows stay in the table (metadata for Lane S seeds + future
 * intake legs) and resolve `null` until a sound leg lands.
 */
export const EVM_RECEIPT_EXCLUDED: Record<string, string> = {
  bankr: 'API leg runs first (order §5: bankr BEFORE clanker)',
  mintclub: 'view/API leg runs before receipt matching (R1 §2 tries (b) first)',
  pinksale:
    'presale-pattern: creation receipt has to=null, no factory (see evidence P1-P4)',
  dxsale:
    'presale-pattern: per-sale contracts, no factory set (R1 §2.9 TBD)',
};

export const EVM_LAUNCHPAD_ROWS: Record<string, LaunchpadRow> = {
  bankr: {
    id: 'bankr',
    name: 'Bankr',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  clanker: {
    id: 'clanker',
    name: 'Clanker',
    buildUrl: (_chain, address) =>
      `https://clanker.world/clanker/${address}`,
  },
  pons: {
    id: 'pons',
    name: 'Pons',
    buildUrl: (_chain, address) =>
      `https://ponsfamily.com/launchpad/${address}`,
  },
  'four-meme': {
    id: 'four-meme',
    name: 'Four.meme',
    buildUrl: (_chain, address) => `https://four.meme/en/token/${address}`,
  },
  zora: {
    id: 'zora',
    name: 'Zora',
    buildUrl: (chain, address) => `https://zora.co/coin/${chain}:${address}`,
  },
  flaunch: {
    id: 'flaunch',
    name: 'Flaunch',
    buildUrl: (chain, address) =>
      `https://flaunch.gg/${chain}/coins/${address}`,
  },
  openserv: {
    id: 'openserv',
    name: 'OpenServ',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  mintclub: {
    id: 'mintclub',
    name: 'Mint Club',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  virtuals: {
    id: 'virtuals',
    name: 'Virtuals Protocol',
    buildUrl: (_chain, address) =>
      `https://app.virtuals.io/prototypes/${address}`,
  },
  pinksale: {
    id: 'pinksale',
    name: 'PinkSale',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  dxsale: {
    id: 'dxsale',
    name: 'DX App',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
};

export interface EvmFactorySet {
  readonly chains: ReadonlyArray<string>;
  readonly factories: ReadonlyArray<string>;
}

/**
 * EVM receipt-`to` factory sets (R1 §§2.1/2.4/2.6/2.11/2.12 + the
 * Virtuals bonding-curve page fetch in Wave-1 QA). Compared
 * case-insensitively against the creation-tx receipt `to`.
 */
export const EVM_FACTORY_SETS: Record<string, EvmFactorySet> = {
  clanker: {
    chains: ['base', 'arbitrum'],
    factories: [
      '0xE85A59c628F7d27878ACeB4bf3b35733630083a9',
      '0x2A787b2362021cC3eEa3C24C4748a6cD5B687382',
      '0x375C15db32D28cEcdcAB5C03Ab889bf15cbD2c5E',
      '0x732560fa1d1A76350b1A500155BA978031B53833',
      '0x9B84fcE5Dcd9a38d2D01d5D72373F6b6b067c3e1',
      '0x250c9FB2b411B48273f69879007803790A6AeA47',
      '0xEb9D2A726Edffc887a574dC7f46b3a3638E8E44f',
    ],
  },
  pons: {
    chains: ['robinhood'],
    factories: [
      '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
      '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB',
    ],
  },
  'four-meme': {
    chains: ['bsc'],
    factories: [
      '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
      '0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC',
    ],
  },
  zora: {
    chains: ['base', 'ethereum', 'arbitrum', 'polygon', 'optimism'],
    factories: ['0x777777751622c0d3258f214F9DF38E35BF45baF3'],
  },
  flaunch: {
    chains: ['base', 'robinhood'],
    factories: [
      '0x516af52d0c629b5e378da4dc64ecb0744ce10109',
      '0xc5B2E8F197407263F4B62a35C71bFc394ecF95D5',
      '0x6A53F8b799bE11a2A3264eF0bfF183dCB12d9571',
      '0xb4512bf57d50fbcb64a3adf8b17a79b2a204c18c',
      '0x0cf6bdf0a85a9d6763361037985b76c8893553af',
    ],
  },
  openserv: {
    chains: ['base'],
    factories: [
      '0xb9A1094D614c70B94C2CD7b4efc3A6adC6e6F4d3',
      '0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a',
      '0x8BF02b8da7a6091Ac1326d6db2ed25214D812219',
    ],
  },
  virtuals: {
    chains: ['base', 'robinhood'],
    factories: [
      '0x1A540088125d00dD3990f9dA45CA0859af4d3B01',
      '0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007',
    ],
  },
};

export interface EvmChainTransport {
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly blockscoutUrl: string | null;
}

/**
 * Keyless EVM transports (public RPC + Blockscout `getcontractcreation`,
 * R1 §2 general note). Adapter review first (task MUST DO): Alchemy
 * exposes receipts/logs but is keyed + eth-mainnet-only; Moralis has
 * no receipt/trace leg; FluxRPC is Solana-only — hence this keyless
 * leg, zero new API keys. BSC/Arbitrum/Polygon/Optimism/Avalanche
 * Blockscout hosts are best-effort (null-safe: unknown → null).
 */
export const EVM_CHAIN_TRANSPORTS: Record<string, EvmChainTransport> = {
  ethereum: {
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    blockscoutUrl: 'https://eth.blockscout.com',
  },
  base: {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    blockscoutUrl: 'https://base.blockscout.com',
  },
  bsc: {
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockscoutUrl: 'https://bnb.blockscout.com',
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockscoutUrl: 'https://arbitrum.blockscout.com',
  },
  polygon: {
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    blockscoutUrl: 'https://polygon.blockscout.com',
  },
  robinhood: {
    chainId: 4663,
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    blockscoutUrl: 'https://robinhoodchain.blockscout.com',
  },
  optimism: {
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    blockscoutUrl: 'https://optimism.blockscout.com',
  },
  avalanche: {
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    blockscoutUrl: 'https://avalanche.blockscout.com',
  },
};

export const BANKR_API_BASE = 'https://api.bankr.bot';
export const MINTCLUB_API_BASE = 'https://mint.club';
export const HEAVEN_POOL_STATE_URL = 'https://tx.api.heaven.xyz/data/pool-state';

export function launchpadInfo(
  id: string,
  chain: string,
  address: string,
): LaunchpadInfo | null {
  const row = SOLANA_LAUNCHPAD_ROWS[id] ?? EVM_LAUNCHPAD_ROWS[id] ?? null;
  if (row === null) return null;
  return { id: row.id, name: row.name, url: row.buildUrl(chain, address) };
}
