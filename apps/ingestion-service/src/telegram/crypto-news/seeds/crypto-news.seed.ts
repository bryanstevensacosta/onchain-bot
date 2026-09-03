/**
 * @deprecated REMOVED - This file is kept for reference only
 *
 * Static seed list of Telegram crypto-news channel peer IDs.
 * This seeder has been COMPLETELY REPLACED by database-driven architecture.
 *
 * All crypto-news sources are now loaded from backend DB via:
 * - BackendChannelProviderService.fetchActiveCryptoNewsSourceIds()
 * - Fetches from: GET /api/crypto-news/sources/active/ids
 *
 * To add new sources:
 * - POST /api/crypto-news/sources with { channelId, handle, title }
 * - Channel IDs MUST use Telegram's full format: -100XXXXXXXXX
 *
 * This file exists only as reference documentation.
 * DO NOT USE INGESTION_TELEGRAM_NEWS_SEED_ENABLED=true in any environment.
 */
export interface SeedCryptoNewsChannel {
  readonly channelId: string;
  readonly handle?: string;
  readonly title?: string;
}

/**
 * Reference list (NOT USED - for documentation only)
 * All channel IDs use correct Telegram format: -100XXXXXXXXX
 */
export const CRYPTO_NEWS_SEED: ReadonlyArray<SeedCryptoNewsChannel> = [
  {
    channelId: '-1001811915252',
    handle: 'shoalresearch',
    title: 'Shoal Research Hub',
  },
  {
    channelId: '-1001556054753',
    handle: 'WatcherGuru',
    title: 'Watcher Guru',
  },
  {
    channelId: '-1001072723547',
    handle: 'cointelegraph',
    title: 'Cointelegraph',
  },
  {
    channelId: '-1002207386483',
    handle: 'lookonchainchannel',
    title: 'Lookonchain',
  },
  {
    channelId: '-1001569666929',
    handle: 'unfolded_defi',
    title: 'unfolded. DeFi',
  },
  {
    channelId: '-1004466661332',
    handle: undefined,
    title: 'Test Ingestion',
  },
  {
    channelId: '-1001350475252',
    handle: 'coinmarket',
    title: 'Crypto Insider',
  },
];
