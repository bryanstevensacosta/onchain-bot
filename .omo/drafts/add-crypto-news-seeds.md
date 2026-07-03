---
slug: add-crypto-news-seeds
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/add-crypto-news-seeds.md (done) — wait for user approval
approach: single-file edit; replace the placeholder array entries with 5 real channel seeds; preserve handle-as-title convention
---

# Draft: add-crypto-news-seeds

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
|----|--------------------|--------|---------------|
| C1 | `crypto-news.seed.ts` exports 5 real channels | active | `.omo/evidence/task-1-seed-edit.diff` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|------------|-----------------|-----------|-------------|
| `title` field source | use the handle (no `@`) as the title, preserving the user's exact casing | user gave only `id` + `@handle`; the placeholder example shows a title is included; handle is the most faithful derivation | yes — edit the array entry |
| `.env` change to enable ingestion | NOT changed in this plan | user asked only to "add the seeds", not to flip `INGESTION_TELEGRAM_NEWS_SEED_ENABLED=true` | yes — separate one-line env edit |
| Channel ID type | stored as string (per existing `channelId: '1000000001'` pattern in the placeholder) | matches the existing seed interface and aggregate validation regex (`/^-?\d+$/`) | yes |

## Findings (cited - path:lines)
- `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/seeds/crypto-news.seed.ts:14-25` — `SeedCryptoNewsChannel` interface + empty `CRYPTO_NEWS_SEED` array with placeholder comment block (the exact site to edit).
- `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity.ts:42-76` — `create()` validates `channelId` against `/^-?\d+$/` and requires non-empty `title` (after trim). Strings are mandatory.
- `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder.ts` (per codegraph, co-located with the seed) — consumes `CRYPTO_NEWS_SEED` at bootstrap when `newsSeedConfig.enabled` is true.
- `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts:53-104` — bootstrap calls `cryptoNewsSeeder.seed()` only if `newsSeedConfig.enabled`; registers sources for `TelegramListenerPort.subscribe()`.
- `apps/backend/src/shared/common/config/app.config.ts` — owns `INGESTION_TELEGRAM_NEWS_SEED_ENABLED` env toggle (referenced in coordinator, not modified here).
- Frontend consumes this via `GET /crypto-news/sources` and `GET /crypto-news/messages` (`apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts:33-81`), rendered at `/crypto-news` (`apps/frontend/src/pages/crypto-news/index.tsx:9-109`).

## Decisions (with rationale)
- **Edit only the seed array.** No entity, controller, frontend, or `.env` change needed to make the seeds exist. Activation toggle is a separate, reversible decision the user can flip later.
- **Use handle as title (no transformation).** Predictable, reversible, and matches the casing the user wrote. If the user prefers proper title-casing ("Shoal Research", "Watcher Guru", "Coin Telegraph", etc.), a follow-up rename is trivial.
- **Single commit, single file.** Trivial scope. No tests added because there is no `*.spec.ts` covering the seed array; the cost of adding one outweighs the value for a 5-line static list (no behavior, no invariants beyond "is an array of objects").

## Scope IN
- Replace placeholder block in `crypto-news.seed.ts:20-25` with the 5 real entries.
- Keep `handle` field populated (interface allows optional `handle?`; populating it gives the frontend filter dropdown readable labels).

## Scope OUT (Must NOT have)
- No `.env` edit (no flip of `INGESTION_TELEGRAM_NEWS_SEED_ENABLED`).
- No change to the entity, repository, controller, frontend, or seeder logic.
- No derived "pretty" titles — keep handle verbatim.

## Open questions
- None blocking. The "title formatting" question is reversible and surfaced as a sanity-check item in the plan TL;DR.

## Approval gate
status: awaiting-approval
<!-- Loop guard: re-read this draft on any later turn before re-exploring. -->
