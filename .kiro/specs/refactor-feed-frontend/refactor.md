# Refactor Feed Frontend - Refactor

**Versión:** 0.1 (viva — se define por rondas, nunca de golpe)
**Fecha:** 2026-10-01
**Base:** `overview.md` (inventario CRUDO) + plan `.omo/plans/refactor-feed-frontend.md`
**Método:** cada ronda fija UNA decisión con una pregunta al dueño + sugerencia. Este archivo registra las fijadas y lista las abiertas.

## Decisiones fijadas

- D1 Slices frontend: **sessions + messages**. Queue vive como tab Queue + badges en messages.
- D2 Queue tab: **switches matching/LLM/publishing** + estados Pending/Blocked/Published como badges en messages.
- D3 ETA aleatoria **ya** (no diferida): `etaMs` + `deadlineAt` al encolar; countdown `~Xs` en badge pending.
- D4 ETA asignada por **feed-publisher** al encolar (una sola fuente de verdad).
- D5 delay/cap **fuera de `LlmConfig`** (es publishing, no LLM). LLM puro se centraliza en **ai-ml** y se consume vía HTTP.
- D6 queue + dailyCap + reset + delay **migran a scheduling-posts** (reusable por otros BCs).
- D7 Split 4 dueños: **feed-publisher** decide qué · **scheduling-posts** cuándo/cuánto · **ai-ml** genera al publicar · **gateway** transporta (tubo tonto).
- D8 UI queue en nuevo **`features/publishing-queue`**; app `scheduling-posts`→**`publishing-queue`** con `scheduled/` (renombrado de `scheduled-posts`) + `scheduling/` + `health/` + `gateway/` (nuevo client) + `telegram/`; `telegram-bots-gateway` **NO** se renombra (evita choque con `telegram/` adapters).
- D9 **telegram-bots centraliza adapters** + acceso a bots para publicar; el resto consume por HTTP sin tokens.
- D10 Orden: **adapters primero**, alcance **solo feed** (KOL-bot fuera).
- D11 Rename de wire **por superficies (A6)** con **dual-serve** (precedente P41): `crypto-news`→`feed` (SSE `messageType`, `contentType`, rutas), `/api/content-templates`→`/api/templates`, `useProfile*`→`useSession*`, keys `profileKeys`→`feedSessionKeys`. Alcance (fijado 2026-10-01): D11 es dirección; la ejecución es por superficies según matriz A6, empezando por prefijos HTTP; ninguna superficie se renombra sin su todo propio; rige el plan ("no renombrar aún") hasta entonces.
- D12 **`LlmConfig` slim**: `defaultTemplateId`, `llmEnabled`, `llmMaxAttempts`, model/tokens (vía ai-ml). dailyCap/reset/delay→pacing; publishingEnabled+targetChannel→bindings de publishing-queue.

## Lenguaje ubicuo objetivo (1 responsabilidad por slice)

- `Session` (tab viva: template cargado o ad-hoc, toggles de sources, keywords propias, switches, scheduling propio, N targets) — concepto `/profiles` eliminado.
- `Template` (snapshot guardado: todo menos nombre/targets; reusable GLOBAL).
- `feed` (reemplaza `crypto-news` en tipos, rutas, `type=` y display).
- `Queue` (pacing + countdown; vive en publishing-queue, se muestra como badges en messages).
- `Publishing` (delivery: caps, delays, bindings por bot+canal; vive en publishing-queue).
- DeliveryPolicy (value object: delayMinMs/delayMaxMs/dailyCap/resetHour por binding bot+canal + fallback global; decide cuándo y cuánto se publica).

## Rondas abiertas (una-a-una, con sugerencia inicial)

- R1 `DeliveryPolicy` por target (RESUELTA 2026-10-01): value object `{delayMinMs, delayMaxMs, dailyCap, resetHour}` por target (telegram|threads, como hoy); `domain/delivery-policy.vo.ts` con `rollDelayMs()`; rutas `GET/PATCH /api/scheduling/delivery-policies/:target` con dual-serve de `rotation-config` (@deprecated una fase); `SchedulingTargetLimits` pasa a alias @deprecated; `scheduling-config.entity.ts` usa DeliveryPolicy; frontend `api/delivery-policy-api.ts` + `ui/delivery-policy-form.tsx` (reemplaza rotation-form). Todo en publishing-queue (hoy scheduling-posts); el monolito `:3030` no se toca.
- R2 Cola en publishing-queue (RESUELTA 2026-10-01): se muda `src/queue/` de feed-publisher tal cual (mismos nombres `PublisherQueueEntry/QueueManager`, tope 36, TTL 24h, dreno 1/min); `etaMs/deadlineAt` se añaden al mudar; rewire a ai-ml/gateway en fase siguiente. Rutas con mismo sufijo (`GET/DELETE /api/queue`, `GET /api/queue/stats`) cambiando solo el prefijo `/feed-api`→`/scheduling-api`, dual una fase.
- R3 Tipos frontend (RESUELTA 2026-10-01): espejo 1:1 sin alias legacy — `FeedSession` (borra `FeedSessionView`/Profile), `FeedTemplate`, `FeedMessage` con `type='feed'`, `FeedQueueEntry` (+etaMs/deadlineAt) + `QueueBadge {status, etaLabel}` en `features/publishing-queue`; keys `feedSessionKeys` (borra `profileKeys`).
- R4 Countdown del badge (RESUELTA 2026-10-01): pending muestra `~Xs` (<60s) → `~Xm` (<60min) → `~Xh`, más `#N` posición en cola (ej `~45s · #3`); helper puro `formatQueueEta()`; poll 10s de `use-queue` existente.
- R5 Tabs de Session (RESUELTA 2026-10-01): orden Overview|Sources|Keywords|Filters|Control|LLM|Target; la tab de salida se llama **Control** (switches matching/LLM/publishing + estado de la cola + DeliveryPolicy), no Queue.
- R6 Reparto de slices (RESUELTA 2026-10-01): `feed-publisher` = decisión de contenido (keywords, blacklist, phrases, filters, matching, sessions, keywords-section); `features/publishing-queue` (nuevo) = delivery (queue-view, badges, switches Control, delivery-policy-form, stats, prompt-templates, matching-toggle).

## Árbol publishing-queue (FIJADO 2026-10-01)

5 BCs + shared (`scheduled-posts/`→`scheduled/`, `telegram/` fusionado en `gateway/`):

- `health/` — parte médico: `GET /api/health` con estado por componente.
- `scheduled/` — agenda de posts con hora exacta: `ScheduledPost`, `SchedulePostUseCase`, `FireDuePostsUseCase`, `CancelScheduledPostUseCase`, cron despertador 1min, controller `POST/GET/GET :id/DELETE/publish-now`.
- `scheduling/` — catálogo rotativo + ritmo: `RotationPost` (rename de `ScheduledAd`, recurrente), `SchedulingConfig` con `DeliveryPolicy` por target, `RotationDeciderService`, `DeliveryPoliciesController` (+ `rotation-config` dual @deprecated), librería `RotationMediaEntry`.
- `queue/` — cola mudada de feed-publisher tal cual + `etaMs/deadlineAt`; rewire ai-ml/gateway después.
- `gateway/` — dueño único del transporte: client HMAC (vault ids, nunca tokens) + dispatchers + libro de paridad. Absorbe `telegram/`.
- `shared/` — guard api-key, filtros, config. Sin negocio.

Regla hora exacta: el post programado con hora exacta **salta el delay aleatorio pero respeta `dailyCap` (HOLD + marca tardío) y `resetHour`**; la UI avisa si la hora elegida cae en zona de riesgo de cap.

## Apéndices de construcción (del high-accuracy review 2026-10-01; bloquean worker hasta resolverse en código)

- A1 Lista adapters (adapters-primero = `src/target/` vivo, no `telegram/`): (a) `target/` (TargetDispatcherService + TargetQueuedArticleDispatcher + ThreadsPublisherHttpClient + per-binding pacing) → `publishing-queue/gateway/` como path vivo; (b) `telegram/infrastructure/bot-api/*` (CryptoNews/Threads/Base adapters + router + rate limiter) → DELETE (dual-leg muerto, borrado ya previsto); (c) `telegram/infrastructure/gateway/*` + mapping + parity → fusionar en `gateway/` sin duplicar. Prohibido tocar KOL-bot (`apps/kol-calls*/src/telegram/`, `apps/backend/src/telegram/vip-calls/`) por gate de paths.
- A2 Paridad P42: `gateway/` es gateway-only (P42 manda); paridad estilo scheduling (planeado-vs-gateway, una sola forma `GET /api/telegram/parity`); feed-publisher queda en `dual` hasta `assertNoDivergence()==0` en ambos ledgers, luego cutover. Cero código Bot API directo en publishing-queue.
- A3 Queue single-writer en dual: feed-publisher enqueue ESCRIBE, publishing-queue drain LEE por HTTP (decidido 2026-10-01); el otro cron apagado por env (`QUEUE_CRON_ENABLED`/`MATCHING_CRON_ENABLED`); wiring TypeORM ANTES de mudar; flags: MATCHING_CRON_ENABLED (existe, feed-publisher escribe) + QUEUE_CRON_ENABLED (nuevo, default false en dual: PQ drain apagado, lee por HTTP) (probe `findByChannelIdAndMessageId` con dueño fijado).
- A4 Migración DeliveryPolicy: `delayMinMs=delayMaxMs=publishDelayMs` (conserva hora exacta); `resetHour=LlmConfig.dailyResetUtcHour` (si no, 0 UTC); `enabled/everyNPosts/minMinutesBetweenAds` congelados solo en ruta vieja; `:target ∈ {telegram,threads}` (400 si no); frontend lee ruta nueva primero, fallback a vieja en 404 (una fase).
- A5 Triple eta: `create({delayMinMs,delayMaxMs,now,rng})` → `{etaMs=rollDelayMs(rng), deadlineAt=now+etaMs}` persistido en el mismo `save()`; `releaseToPending()` CONSERVA deadline (sin re-roll); `markScheduled/markPublishing` no lo tocan; `formatQueueEta(deadlineAt, now)` puro; `#N` = índice en orden `queuedAt` ASC.
- A6 Matriz wire `crypto-news→feed` (8 superficies, dual = acepta ambas, canónica `feed`): SSE `messageType`, `contentType` VO, `?type=`, prefijos HTTP (extender patrón dual `['api/feed','api/crypto-news']`), columna DB (ensanchar check + backfill offline), disco (servir ambas raíces `feed/media/`+`crypto-news/media/`), proxies vite+nginx (ambas confs + staging), grep gates P10/P32 (allowlist solo shims dual). Migraciones DB/disco como todos SEPARADOS antes del flip.
- A7 Migración LlmConfig→policies: `dailyCap→DeliveryPolicy[*].dailyCap` (ambos targets, operador ajusta), `dailyResetUtcHour→resetHour`, `randomDelayMin/Max→delayMin/Max`, `targetChannel→telegram binding[0].chatId` (crear si falta), `publishingEnabled→enabled` por binding (decidido 2026-10-01: global→todos los bindings, operador ajusta), `rejectNonLatin` se queda en slim (explícito); use-case idempotente `migrateLlmConfigToPolicies()` + backfill fila `id=1`; columnas viejas read-only @deprecated una fase.
- A8 Frontend dual-alias (sin borrado hasta cutover): `useSession*` nuevo + `useProfile*` re-export @deprecated; `feedSessionKeys` canónico + `profileKeys` alias; tipo `'kol'|'crypto-news'|'feed'` con normalizador `toFeedType()` (acepta ambas, canoniza `feed` en UI); tests a actualizar: `feed-sessions.test.tsx`, `feed-page.test.tsx`, `scheduling-rotation-config-form.test.tsx`, `http-client.test.ts`, `threads-api-urls.test.ts`.
- A9 Constantes y env: `QUEUE_MAX_PENDING` + `QUEUE_TTL_HOURS` dueños en `publishing-queue/shared/config`; seeds congelados 2026-10-01: QUEUE*MAX_PENDING=500, QUEUE_TTL_HOURS=24 (36 queda como fallback dev); seeds `SCHEDULING_TELEGRAM*\*`conservan claves una fase con warning`deprecated seed`; vault migration (MigrateBotsToGatewayUseCase por env) ANTES del rewire del drain; drain vía ai-ml alcance texto-solo (decidido 2026-10-01); media se salta con marca skipped, nunca matched falso.
- A10 Exact-time UI: badge `at HH:MM` cuando `etaMs==null`, countdown R4 en resto; HOLD fija `late=true`; health suma indicadores `queue`+`gateway`+`delivery-policies`; `shared/` solo guard+filter+config (allowlist).

## Apéndice B — rutas y fusiones canónicas (2026-10-01)

- B8 Tabla mkdir/mv: la app se renombra `apps/scheduling-posts` → `apps/publishing-queue` (git mv); dentro: `src/scheduled-posts/` → `src/scheduled/` (nombres de archivos intactos), `src/scheduling/` igual, `src/queue/` (mudado de feed-publisher tal cual), `src/gateway/` (nuevo: absorbe `src/target/` vivo de feed-publisher + `src/telegram/infrastructure/gateway/*`; `src/telegram/` restante se BORRA tras el merge), `src/shared/` + `src/health/` igual.
- B9 Rutas exactas queue (controladores reales, sin reescritura de prefijo en-app): `QueueController @Controller('api/queue')` con `GET /`, `GET /stats`, `DELETE /:id`; `MatchingConfig` en `feed-publisher/matching` (no `/feed-api`); el cambio de prefijo es solo proxy vite/nginx (`/feed-api/*`→ backend :3040 hoy, `/scheduling-api/*`→ :4080 tras mudar). Frontend alterna `feedPublisherPath()`→`schedulingPath()` en dual.
- B10 P42 en un párrafo: transporte SOLO vía telegram-bots-gateway (vault botId + HMAC `METHOD path ts once sha256(body)`, nunca tokens en apps); paridad = planeado-vs-gateway en `GET /api/telegram/parity` (nuevo controller en `gateway/`, forma `{total, diverged, records}` estilo scheduling); ledgers = dual-send (feed-publisher) + planned-vs-gateway (publishing-queue); cutover cuando ambos `diverged==0`.
- B11 DDL: `DeliveryPolicy` vive embebida en `SchedulingConfigOrmEntity` (columnas `telegram_delay_min_ms/_max_ms/_daily_cap/_reset_hour`, `threads_*`, ints ≥0); `PublisherQueueEntry` suma `eta_ms bigint NULL, deadline_at timestamptz NULL, late boolean default false`; migración `17XXXXXXXXXX-DeliveryPolicyAndQueueEta.ts` + backfill `delayMin=delayMax=publishDelayMs, resetHour=dailyResetUtcHour, etaMs/deadlineAt NULL (solo filas nuevas)`; `releaseToPending()` conserva deadline.
- B12 `toFeedType()` scope: normaliza `'crypto-news'|'feed'` → `'feed'` (canónico UI); `'kol'` fuera de scope (otro flujo, no tocar); vive en `entities/feed/model/` con tests puros; `useSession*` nuevo en `entities/feed-session/model/use-feed-sessions.ts` + `useProfile*` re-export @deprecated (borrado solo en cutover).
