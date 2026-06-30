/**
 * Static seed list of Telegram crypto-news channel peer ids to register
 * on application bootstrap.
 *
 * Override at runtime via the INGESTION_TELEGRAM_SEED_NEWS env var
 * (format: "channelId[,channelId...]" or
 *  "channelId|handle|title[,channelId|handle|title...]").
 *
 * Disable entirely with INGESTION_TELEGRAM_NEWS_SEED_ENABLED=false.
 *
 * NOTE: This list is intentionally a placeholder. Replace with real
 * crypto-news channel IDs before enabling in production.
 */
export interface SeedCryptoNewsChannel {
  readonly channelId: string;
  readonly handle?: string;
  readonly title?: string;
}

export const CRYPTO_NEWS_SEED: ReadonlyArray<SeedCryptoNewsChannel> = [
  // Placeholder — user to fill in actual crypto-news channel IDs.
  // Example:
  // { channelId: '1000000001', title: 'CoinDesk' },
  // { channelId: '1000000002', title: 'CoinTelegraph' },
];
