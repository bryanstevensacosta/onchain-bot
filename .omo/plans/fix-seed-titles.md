# Fix Seed Titles + Prod DB

## Goal
Update the crypto-news seed file with real channel titles and update the production DB.

## Todos

### 1. Fix `crypto-news.seed.ts`
**File**: `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/seeds/crypto-news.seed.ts`

Replace `CRYPTO_NEWS_SEED` entries:

| channelId | handle | title |
|---|---|---|
| `1811915252` | `shoalresearch` | `Shoal Research Hub` |
| `1556054753` | `WatcherGuru` | `Watcher Guru` |
| `1072723547` | `cointelegraph` | `Cointelegraph` |
| `2207386483` | `lookonchainchannel` | `Lookonchain` |
| `1569666929` | `unfolded_defi` | `unfolded. DeFi` |
| `4466661332` | `undefined` | `Test Ingestion` |

For `4466661332`, use `handle: undefined` instead of `handle: 'undefined'` string.

### 2. Update production DB via SSH
Connect to droplet and run SQL updates:
```sql
UPDATE crypto_news_sources SET title = 'Shoal Research Hub' WHERE channel_id = '1811915252';
UPDATE crypto_news_sources SET title = 'Watcher Guru' WHERE channel_id = '1556054753';
UPDATE crypto_news_sources SET title = 'Cointelegraph' WHERE channel_id = '1072723547';
UPDATE crypto_news_sources SET title = 'Lookonchain' WHERE channel_id = '2207386483';
UPDATE crypto_news_sources SET title = 'unfolded. DeFi' WHERE channel_id = '1569666929';
UPDATE crypto_news_sources SET title = 'Test Ingestion' WHERE channel_id = '4466661332';
```

### 3. Verify
- `cd apps/backend && npx tsc --noEmit --incremental false` — 0 errors