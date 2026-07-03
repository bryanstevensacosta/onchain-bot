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
  { channelId: '1811915252', handle: 'shoalresearch', title: 'shoalresearch' },
  { channelId: '1556054753', handle: 'WatcherGuru', title: 'WatcherGuru' },
  { channelId: '1072723547', handle: 'cointelegraph', title: 'cointelegraph' },
  {
    channelId: '2207386483',
    handle: 'lookonchainchannel',
    title: 'lookonchainchannel',
  },
  { channelId: '1569666929', handle: 'unfolded_defi', title: 'unfolded_defi' },
];
