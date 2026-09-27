/**
 * Chain-logo domain (chain-logo resolver).
 *
 * Our chain catalog ids (`chain/domain/chain-info.ts`) do NOT match the
 * upstream TrustWallet slugs 1:1: TrustWallet serves BNB Smart Chain
 * under `binance`, while our catalog (and CoinGecko terminals) call it
 * `bsc`. The maps below pin the verified correspondence so the resolver
 * never interpolates blindly.
 *
 * Verified 2026-09-27 against
 * https://github.com/trustwallet/assets/tree/master/blockchains
 * (ethereum, solana, binance, base, arbitrum, polygon) and the
 * CoinGecko `asset_platforms` ids.
 */
export const CHAIN_LOGO_TRUSTWALLET_IDS: Readonly<Record<string, string>> = {
  ethereum: 'ethereum',
  solana: 'solana',
  bsc: 'binance',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
};

export const CHAIN_LOGO_COINGECKO_IDS: Readonly<Record<string, string>> = {
  ethereum: 'ethereum',
  solana: 'solana',
  bsc: 'binance-smart-chain',
  base: 'base',
  arbitrum: 'arbitrum-one',
  polygon: 'polygon-pos',
};

const TRUSTWALLET_LOGO_BASE =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

const COINGECKO_PLATFORM_BASE = 'https://api.coingecko.com/api/v3/asset_platforms';

export function normalizeChainLogoId(id: string): string {
  return (id ?? '').trim().toLowerCase();
}

export function isSupportedChainLogo(id: string): boolean {
  return CHAIN_LOGO_TRUSTWALLET_IDS[normalizeChainLogoId(id)] !== undefined;
}

export function primaryLogoUrl(chainId: string): string | null {
  const slug = CHAIN_LOGO_TRUSTWALLET_IDS[normalizeChainLogoId(chainId)];
  if (slug === undefined) {
    return null;
  }
  return `${TRUSTWALLET_LOGO_BASE}/${slug}/info/logo.png`;
}

export function coingeckoPlatformUrl(chainId: string): string | null {
  const platform = CHAIN_LOGO_COINGECKO_IDS[normalizeChainLogoId(chainId)];
  if (platform === undefined) {
    return null;
  }
  return `${COINGECKO_PLATFORM_BASE}/${platform}`;
}

/**
 * Gateway URL served for frontend badges (`[logo] name`).
 */
export function chainLogoUrl(chainId: string): string {
  return `/api/v1/chains/${normalizeChainLogoId(chainId)}/logo`;
}

/**
 * 1x1 transparent PNG placeholder. Served when every upstream 404s and
 * for unknown chains — the badge never breaks, the service never throws.
 */
export const PLACEHOLDER_PNG: Buffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
