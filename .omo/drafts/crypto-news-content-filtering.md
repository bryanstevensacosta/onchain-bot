---
slug: crypto-news-content-filtering
status: drafting
intent: clear
pending-action: write .omo/plans/crypto-news-content-filtering.md
approach: Two independent but related features:
1. Configurable content filtering during ingestion (per-channel, regex-based, stored in DB)
2. HTML/Telegram entity to Markdown conversion for publishing pipeline
Both implemented as independent services in the ingestion and publishing pipelines respectively.

---

# Draft: crypto-news-content-filtering

## Components (topology ledger)

| id  | outcome                                                          | status   | evidence                                         |
| --- | ---------------------------------------------------------------- | -------- | ------------------------------------------------ |
| C1  | ContentFilterService - regex-based content filtering per-channel | active   | apps/backend/src/telegram/ingestion/crypto-news/ |
| C2  | ChannelContentFilterConfig entity - per-channel filter rules     | active   | apps/backend/src/telegram/ingestion/crypto-news/ |
| C3  | MarkdownConverter service - HTML/Telegram entities to Markdown   | active   | apps/backend/src/telegram/ingestion/crypto-news/ |
| C4  | FilterConfig entity + repo - stores per-channel filter rules     | active   | apps/backend/src/telegram/ingestion/crypto-news/ |
| C5  | Frontend UI for managing filter rules per channel                | deferred | apps/frontend/src/                               |

## Open assumptions (announced defaults)

| assumption      | adopted default                                       | rationale                                                 | reversible? |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------- | ----------- |
| Filter timing   | Apply at ingestion time (StoreNewsMessageUseCase)     | Prevents dirty data in DB, reduces storage                | yes         |
| Filter matching | Regex-based, case-insensitive by default              | Powerful enough for "News \| Markets \| YouTube" patterns | yes         |
| Filter storage  | JSONB column on CryptoNewsSource entity               | Flexible, queryable, no new table                         | yes         |
| HTML conversion | At publish time (ProcessNextQueuedArticleUseCase)     | Keeps raw content in DB, converts at publish time         | yes         |
| HTML parser     | Use existing Telegram entities + minimal HTML parsing | Leverages existing Telegram entities, minimal deps        | yes         |
| Frontend        | Separate CRUD page for filter rules per channel       | Consistent with existing channel management               | yes         |

## Findings (cited - path:lines)

- StoreNewsMessageUseCase receives content with entities: apps/backend/src/telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case.ts:18-45
- Entities include type, offset, length, url - can be used for HTML parsing
- Media downloaded via MtprotoMediaDownloader with HEVC transcoding
- PublisherCronScheduler runs every minute via @Cron(EVERY_MINUTE)
- ProcessNextQueuedArticleUseCase calls dispatchToTelegram with content
- Current entities include: offset, length, type, url - standard Telegram entities
- Publisher uses BotApiCryptoNewsPublisherAdapter.sendPhoto/sendVideo/sendMessage
- CryptoNewsSource entity exists with channelId, handle, title, isActive
- No existing content filtering mechanism
- Media downloaded via MtprotoMediaDownloader with HEVC transcoding

## Decisions (with rationale)

| decision                               | rationale                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Filter at ingestion time               | Prevents dirty data from entering DB, reduces storage, no need to clean later |
| Regex-based filters                    | Most flexible for patterns like "News \| Markets \| YouTube"                  |
| Per-channel config                     | Different channels need different filters; Cointelegraph ≠ WatcherGuru        |
| Filter config on CryptoNewsSource      | Already has channelId, handle, title - natural place                          |
| HTML→Markdown at publish time          | Keeps raw content intact in DB, converts only at publish                      |
| Use Telegram entities for HTML parsing | No new deps, Telegram entities map to Markdown                                |
| Publisher handles conversion           | ProcessNextQueuedArticleUseCase already has content + media paths             |
| Frontend CRUD separate                 | Consistent with existing channel management                                   |

## Scope IN

- ContentFilterService with regex-based filtering at ingestion time
- ChannelContentFilterConfig entity with regex patterns + replacement strings
- CryptoNewsSource entity extended with filterConfig JSONB column
- MarkdownConverter service using Telegram entities + minimal HTML parsing
- ProcessNextQueuedArticleUseCase integration for HTML→Markdown at publish
- Frontend CRUD for filter rules per channel
- Tests for filter service, markdown converter, and integration

## Scope OUT (Must NOT have)

- No full HTML parser (e.g., cheerio, jsdom) - use Telegram entities only
- No content modification at rest in DB (only at publish time)
- No changes to existing message storage format
- No changes to media download/HEVC pipeline
- No changes to media retention (48h→72h) or publisher TTL (7d)

## Open questions

1. Should filters support capture groups for replacement? (Adopted: yes, for future flexibility)
2. Should filters be applied to title as well as content? (Adopted: yes)
3. Should filter config be per-channel or global? (Adopted: per-channel via CryptoNewsSource)

## Approval gate

status: approved
pending-action: write .omo/plans/crypto-news-content-filtering.md (already scaffolded, todos refined with security/performance hardening)
approach: Two independent but related features: 1) Configurable content filtering during ingestion (per-channel, regex-based, stored in DB) 2) HTML/Telegram entity to Markdown conversion for publishing pipeline. Both implemented as independent services in the ingestion and publishing pipelines respectively. Refinements: regex timeout protection, priority tie-breaker, JSON entity parsing validation, nested entity tests.
gate-presented-at: 2026-08-28T11:00Z
approved-at: 2026-08-28T11:30Z
approved-by: user "si"
refinements-applied: regex timeout (100ms), priority tie-breaker (createdAt), JSON entity parse validation, nested entity test (<b><i>text</i></b>)
