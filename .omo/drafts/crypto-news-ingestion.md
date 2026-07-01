---
slug: crypto-news-ingestion
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-ingestion.md
approach: Restructure telegram/ingestion into 3 sub-BCs (kol/, crypto-news/, shared/), move KOL seeds/seeder out of kol/identity, create crypto-news domain + persistence + seeder, add unified message routing, new env vars, new frontend page.
---

# Draft: crypto-news-ingestion

## Components (topology ledger)
| id | outcome | status | evidence path |
|---|---|---|---|
| telegram/ingestion/shared/ | Shared infra (listener, safety, config) | active | apps/backend/src/telegram/ingestion/ |
| telegram/ingestion/kol/ | KOL seeds, seeder, orchestration | active | kol/identity/infrastructure/seeds/, kol/identity/infrastructure/seeders/ |
| telegram/ingestion/crypto-news/ | News domain, persistence, seeder | active | N/A - new |
| kol/identity/ | Kol aggregate (unchanged, minus seeder) | active | kol/identity/ |
| crypto-news aggregate (new BC) | Source + message entities | active | N/A - new |
| app.config.ts | New env vars for news seeding | active | shared/common/config/app.config.ts |
| Frontend /crypto-news | New page for news display | active | apps/frontend/src/pages/ |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| KOL seeds stay in kol.seed.ts with same format | Current SeedKol interface reused for news | Minimal cognitive overhead | Yes |
| Crypto-news sources stored in separate DB table | crypto_news_sources (not in kols table) | User rejected coupling, clean separation | Yes |
| Messages stored in tg_crypto_news table | As specified by user | User requirement | Yes |
| Single TelegramListenerPort.subscribe() call | Coordinator collects all channels then subscribes once | Adapter throws CONFLICT on double subscribe | Architecture constraint |
| KOL orchestration stays in kol/identity for now | KolIngestionOrchestratorUseCase NOT moved in this plan | Scope control, can move later | Yes |

## Findings (cited - path:lines)
- KolSeeder at `kol/identity/infrastructure/seeders/kol.seeder.ts:41` — OnApplicationBootstrap, reads `app.ingestion.telegram.seed`
- TelegramListenerPort.subscribe() at `telegram/ingestion/domain/ports/telegram-listener.port.ts:2-14` — single AsyncIterable, throws CONFLICT if called twice
- TelegramMtprotoListenerAdapter.subscribe() at `telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts:77-115` — this.running guard
- KolIngestionOrchestratorUseCase at `kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts:29-151` — bridges ingestion → pipeline via direct calls
- KOL_SEED at `kol/identity/infrastructure/seeds/kol.seed.ts:29-75` — 46 entries, ReadonlyArray<SeedKol>
- app.config.ts at `shared/common/config/app.config.ts:70-83` — ingestion.telegram.seed config block
- KolEntity DB at `kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts:23-57` — table `kols`
- IdentityModule at `kol/identity/identity.module.ts:31-87` — currently provides KolSeeder

## Decisions (with rationale)
1. **3 sub-BCs under telegram/ingestion/** — Clean DDD separation, avoids coupling KOL and news domains
2. **Shared module owns listener + safety** — Both KOL and news use the same MTProto infrastructure
3. **Separate DB tables for news** — crypto_news_sources + tg_crypto_news, fully independent of kols
4. **Single subscribe call via Coordinator** — Technical constraint of the listener adapter
5. **KolIngestionOrchestratorUseCase STAYS in kol/identity** — Moving it would expand scope; can be done later
6. **KOL seeds/seeder MOVE to telegram/ingestion/kol/** — User wants seeds under ingestion, not identity
7. **Toggle INGESTION_TELEGRAM_NEWS_SEED_ENABLED** — Independent control from KOL seeding
8. **Frontend page /crypto-news** — Separate page as user specified

## Scope IN
- Restructure telegram/ingestion/ into shared/, kol/, crypto-news/
- Move KOL seeds/seeder from kol/identity to telegram/ingestion/kol/
- Create crypto-news BC (domain, application, infrastructure)
- New DB tables: crypto_news_sources, tg_crypto_news
- CryptoNewsSeeder (OnApplicationBootstrap)
- StoreNewsMessageUseCase (persist news messages)
- Unified message routing (subscribe once, route by channel type)
- New env vars + app.config entries
- New frontend page /crypto-news with backend endpoint
- Tests for all new code

## Scope OUT (Must NOT have)
- Do NOT rename or refactor the Kol aggregate in kol/identity
- Do NOT change the existing KOL pipeline (extraction → parsing → ...)
- Do NOT add channelType column to kols table
- Do NOT modify existing kol/identity API endpoints
- Do NOT change existing KOL frontend pages
- Do NOT implement real-time WebSocket for news (future)
- Do NOT scrape or transform news content — store as-is

## Open questions
(Resolved through exploration + user decisions)

## Approval gate
status: awaiting-approval
<!-- The user approved the architecture. Now writing the plan. -->
