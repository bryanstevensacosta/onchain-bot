# Ingestion-Telegram Compact Refactor Plan

- **Branch:** `feat/mega-refactor-tramos` (verified `git branch --show-current`)
- **Inputs:** `.omo/evidence/db-review-ingestion.md`, `.omo/evidence/bc-responsibility.log`, `.omo/evidence/coupling-ingestion.log`, `.omo/evidence/shared-verdict.log`, `.omo/evidence/shared-boundaries.md`
- **Scope:** `apps/ingestion-telegram` (+ 1 backend alias fix). No prod data moves; DB todos are additive migrations / entity flags only.

## TL;DR

1. Fix broken backend cross-app alias first (post-flatten 404 path blocks everything).
2. Cut repository ports (FeedSource, FeedMessage) to unblock the god-module split.
3. Cut behaviour ports (Broadcaster, MediaDownloader, KolAvatar) to break cycles C1/C2.
4. Move single-consumer `shared/transformation` pipeline into `core/`; keep `shared/media` (backend is 2nd consumer); delete only zero-importer dead files.
5. Add read-path DB indexes + entity flag fixes + GIN dev automation; no schema redesign.
6. Resolve responsibility overlaps per owner table; finish with gateway composition + Swagger build gate.

## Todos (9)

### 1. Fix backend cross-app alias (broken post-flatten)

- **Files:** `apps/backend/tsconfig.json` (`@ingestion-telegram/telegram/*`), `apps/backend/src/telegram/ingestion/shared/transformers/transformation-import.spec.ts`, `apps/backend/src/main.ts` (alias comment §44-48)
- **Do:** point `@ingestion-telegram/telegram/*` at `../ingestion-telegram/src/shared/transformation/*` (current target `src/shared/telegram/*` does not exist on disk); fix spec import or delete spec if tramo owner retires cross-app use.
- **Done 2026-09-27:** retargeted (5 files) + spec 7/7 green + tsc clean. P60 audit: 0 code deps new→backend; disconnection order in `.omo/evidence/backend-deps-audit.log`.
- **Accept:** `cd apps/backend && npx tsc --noEmit -p tsconfig.json`
- **Evidence:** `.omo/evidence/shared-boundaries.md` §5 (+ §4 P6); `.omo/evidence/shared-verdict.log` — (backend alias roto)
- **Commit:** `fix(backend): correct @ingestion-telegram/telegram alias post-flatten`

### 2. Repository ports FeedSource + FeedMessage (`useClass` wiring, no logic change)

- **Files:** new `apps/ingestion-telegram/src/registry/ports/` + `src/feed/ports/` (interface + token), `src/core/shared.module.ts` (providers), `src/feed/api/http/feed.controller.ts`, `src/registry/api/http/sources.controller.ts`, `src/core/api/mtproto/telegram-mtproto-listener.adapter.ts`, `src/avatar/kol-avatar.service.ts`, `src/health/api/http/health.controller.ts`
- **Do:** `FeedSourceRepositoryPort` (methods `findAllActiveWithTypes/findByChannelId/save`) + `FeedMessageRepositoryPort`; replace 6+ concrete class injections (coupling V1); `useClass` = current TypeORM repos.
- **Accept:** `cd apps/ingestion-telegram && npx jest src/feed src/registry --silent`
- **Evidence:** `.omo/evidence/coupling-ingestion.log` §6 items 1-2, §4 V1
- **Commit:** `refactor(ingestion): add FeedSource/FeedMessage repository ports`

### 3. Behaviour ports Broadcaster + MediaDownloader + KolAvatar (break C2/V2/V3)

- **Files:** new `MessageBroadcasterPort` (`src/core/ports/` or `src/stream/ports/` + adapter in `src/stream/`), `MediaDownloaderPort`, `KolAvatarPort` (`src/avatar/` exposing `fetchOnce/refresh`), `src/core/application/coordinators/message-persistence.coordinator.ts`, `src/core/application/services/telegram-media-extractor.service.ts`, `src/registry/application/use-cases/register-news-source.use-case.ts`
- **Do:** coordinator broadcasts via port (not `StreamService` concrete); extractor downloads via port (not `MediaDownloaderService` concrete); use-case fetches avatar via port (keep `@Optional`); move `TelegramMediaAttachment` type to `shared` (K1) so `shared→core` arrow flips.
- **Accept:** `cd apps/ingestion-telegram && npx jest --silent && rg "forwardRef" src; rg "@Optional\(\)" src`
- **Evidence:** `.omo/evidence/coupling-ingestion.log` §6 items 3-5, 7; §3 C2; §5 K1
- **Commit:** `refactor(ingestion): add broadcaster/media/avatar ports`

### 4. Move `shared/transformation` pipeline → `core/transformation` + rename collision

- **Files:** move `apps/ingestion-telegram/src/shared/transformation/{core,extractors,transformers}/` → `src/core/transformation/` (+ specs/barrels); keep `src/shared/transformation/index.ts` as compat re-export until todo 1 lands; rename shared `TelegramMediaExtractor` → `TelegramRawMediaExtractor` (or core service → `MediaFetchService`)
- **Do:** single-consumer move (only `core` adapter + `shared.module` provider/factory use it); update imports; decide `KolMessageTransformer` + `kol-text-extractor` fate here (move with P1 or delete — 0 runtime consumers).
- **Accept:** `cd apps/ingestion-telegram && npx tsc --noEmit -p tsconfig.json && npx jest src/core --silent`
- **Evidence:** `.omo/evidence/shared-verdict.log` (MOVE-TO-core ×13); `.omo/evidence/shared-boundaries.md` §4 P1-P3
- **Commit:** `refactor(ingestion): move transformation pipeline to core`

### 5. Shared KEEP + dead removal (delete zero-importer files only)

- **Files (delete/flag):** `src/shared/media/core/base-media-retention-policy.ts`, `src/shared/transformation/ports/index.ts` (empty), `src/shared/transformation/utils/media-validation.ts`, `safeToString/coerceToLong` in `src/shared/transformation/utils/type-coercion.ts`; **KEEP:** `common/{auth,cache,config,logging,persistence}`, all of `shared/media` (backend cross-app consumer), `type-coercion` live fns
- **Do:** verify 0 runtime importers via grep, then delete; unify duplicated `MediaPayload` (core-local vs `shared/media/types/media-metadata.ts`) before moving types.
- **Accept:** `cd apps/ingestion-telegram && rg -l "BaseMediaRetentionPolicy|media-validation|safeToString|coerceToLong|ports/index" src --glob '*.ts' | grep -v spec; npx jest src/shared --silent`
- **Evidence:** `.omo/evidence/shared-verdict.log` (MUERTO ×6); `.omo/evidence/shared-boundaries.md` §4 P4-P5
- **Commit:** `chore(ingestion): remove dead shared files`

### 6. DB read-path indexes (additive migration)

- **Files:** new `apps/ingestion-telegram/src/shared/common/persistence/migrations/1790*.ts` (messages `(type, published_at DESC)`, `(channel_id, published_at DESC)`; sources partial `(type) WHERE is_active AND lifecycle_status='ACTIVE'`); no entity renames
- **Do:** cover `findRecent()` / `findByChannelId()` ORDER BY + hot `findAllActive[WithTypes]` predicate (db-review §1-2); leave existing unique `(channel_id, message_id)` untouched.
- **Accept:** `cd apps/ingestion-telegram && npm run migration:show`
- **Evidence:** `.omo/evidence/db-review-ingestion.md` hallazgos 1-2
- **Commit:** `perf(ingestion): add feed read-path indexes`

### 7. DB entity flags + GIN automation + janitor ORDER BY

- **Files:** feed message entity (`media` `eager:true` → false + explicit relations), feed message media entity (double-mapped `message_id` → `insert:false,update:false` or `@RelationId`), dev post-boot GIN recreate (`CREATE INDEX IF NOT EXISTS ... USING GIN`, flag `INGESTION_DEV_RECREATE_GIN` or script), `src/retention/infrastructure/scheduling/feed-retention-cleanup.scheduler.ts` (`ORDER BY ingested_at` in batch SELECT)
- **Do:** 1-line entity fixes + spec check (`telegram-feed-message.repository.spec.ts` orders/limits); automate §3 wart (dev `synchronize:true` destroys GIN); deterministic janitor batches; log 48h aggressive-cutover activation.
- **Accept:** `cd apps/ingestion-telegram && npx jest src/feed src/retention --silent`
- **Evidence:** `.omo/evidence/db-review-ingestion.md` hallazgos 3, 4, 5, 8
- **Commit:** `fix(ingestion): eager/relation-id/GIN/janitor-order`

### 8. Responsibility overlaps per owner table (no logic change)

- **Files:** `src/retention/retention.module.ts` (split `FeedModule` + `RegistryModule`, leave janitor+disk), `src/registry/application/use-cases/register-news-source.use-case.ts` + `src/registry/api/http/sources.controller.ts` (avatar trigger/URL → avatar owner), `src/core/application/services/telegram-media-extractor.service.ts` (slim to orchestrator; bytes owned by media), `src/health/` + `src/metrics/` (stubs→probe, wire counters via ports from todo 3), `src/core/core.module.ts` (watch-list consumes registry)
- **Do:** apply owner column: media=bytes, stream=transport, feed=repos/tables, registry=catalog, avatar=lifecycle, retention=delete-only, core=content-decision; requires todos 2-3 first.
- **Accept:** `cd apps/ingestion-telegram && npx jest --silent`
- **Evidence:** `.omo/evidence/bc-responsibility.log` overlaps 1-12 + scores table
- **Commit:** `refactor(ingestion): split retention god-module, assign overlap owners`

### 9. Gateway composition + Swagger build gate

- **Files:** `apps/ingestion-telegram/src/app.module.ts`, `src/main.ts`, `src/debug/debug-telegram.controller.ts` (own `DebugModule`, non-prod only), `src/retention/retention.module.ts` (controllers moved out in todo 8); Swagger setup in `main.ts`
- **Do:** give `gateway` a single reason to change (composition + wiring); dual-prefix `['api/feed','api/crypto-news']` stays per-slice until cutover (no legacy removal here); document FK-less `messages.channel_id` + `published_at` vs `ingested_at` semantic gap in `DB.md`/docs (db-review §7 + interplay).
- **Accept:** `cd apps/ingestion-telegram && npm run build && npx prettier --check "src/**/*.ts" && npx jest --silent`
- **Evidence:** `.omo/evidence/bc-responsibility.log` (gateway score 2, overlap 5-6); `.omo/evidence/coupling-ingestion.log` §2 roots, §5 K2, §4 V4/V6; `.omo/evidence/db-review-ingestion.md` §7 + interplay
- **Commit:** `refactor(ingestion): gateway composition and swagger build`

## Out of scope (documented, not in todos)

- `last_ingested_at` dead column drop + `DB.md` fix (db-review §6) — needs owner decision (a) vs (b).
- `message_entities` `NOT NULL DEFAULT '[]'` hardening + `type` CHECKs (db-review §9-10) — post-rollout, touch tables.
- FK `messages.channel_id → sources.channel_id` (db-review §7) — decision only, documented in todo 9.
- Legacy dual-prefix cutover, metrics backfill, health stub gap 2 — separate cuts.
