---
slug: refactor-feed-frontend
status: drafting
intent: clear
pending-action: done — plan written; spec docs .kiro/specs/refactor-feed-frontend/overview.md + refactor.md created per explicit owner order ("procede y luego actualiza"); no worktree.md exists in repo (treated as overview.md)
approach: fase 1 overview.md CRUDO (inventario FSD + matriz dev por sección) + fase 2 refactor.md interactivo con D1–D12 precargadas; docs-only, cita-check ligero, sin commits
---

# Draft: refactor-feed-frontend

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

- hub pages/feed | FeedPage compone sessions + messages + sidebar | active | apps/frontend/src/pages/feed/index.tsx
- widgets/feed-sessions | sesión arriba: picker + 6 tabs + management inline + recent badges | active | apps/frontend/src/widgets/feed-sessions/
- features/feed-publisher | keywords/blacklist/phrases/llm/queue UI (legado :3030 + nuevo :3040) | active | apps/frontend/src/features/feed-publisher/
- features/feed-scheduling+feed-filters+manage-feed-sources | ads/rotation, filtros delegados, modal sources | active | apps/frontend/src/features/feed-scheduling/ etc.
- entities+shared/api | feed + feed-session + endpoints + path builders + matriz puertos | active | apps/frontend/src/entities/ + src/shared/api/
- spec docs | overview.md CRUDO + refactor.md D1–D12 | active | .kiro/specs/refactor-feed-frontend/

## Decisions (with rationale)

- D1 slices sessions+messages; queue = tab Queue + badges en messages (dueño, 2026-10-01)
- D2 Queue tab con switches matching/LLM/publishing; estados como badges (dueño)
- D3 ETA aleatoria ya: etaMs+deadlineAt, countdown ~Xs (dueño; overengineering aceptado)
- D4 ETA asignada por feed-publisher al encolar (fuente única; dueño)
- D5 delay/cap fuera de LlmConfig; LLM puro vía ai-ml (dueño: delay es publishing, no LLM)
- D6 queue+dailyCap+reset+delay migran a scheduling-posts (dueño: lo más adecuado, reusable)
- D7 split 4 dueños: feed-publisher qué / scheduling-posts cuándo-cuánto / ai-ml genera / gateway transporta (ambos)
- D8 features/publishing-queue + app scheduling-posts→publishing-queue (scheduled/scheduling/health/gateway/telegram); gateway NO se renombra (evita choque con adapters telegram/) (dueño con matiz)
- D9 telegram-bots centraliza adapters + acceso a bots; resto por HTTP sin tokens (dueño)
- D10 orden adapters-primero, alcance solo-feed, KOL-bot fuera (dueño)
- D11 wire completo ya con dual-serve P41: crypto-news→feed, content-templates→templates, useProfile*→useSession* (dueño)
- D12 LlmConfig slim: defaultTemplateId, llmEnabled, llmMaxAttempts, model/tokens (dueño)
- Alcance overview: solo dev localhost + nota staging/prod; /feed estricto; tests = cita-check ligero (dueño)

## Approval gate

status: approved-by-owner 2026-10-01 ("procede y luego actualiza el worktree.md y el refactor.md"); plan escrito en este turno

- Bloqueo: el planner solo escribe bajo `.omo/` y la delegación a subagentes falla (ProviderModelNotFound). Los contenidos finales de ambos docs quedan staged abajo para copia directa a `.kiro/specs/refactor-feed-frontend/`.
- Nota: no existe ningún `worktree.md` en minúsculas; sí `WORKTREE.md` (registry). Actualizado vía subagente + llevado al principal con patch (`git apply --check` OK) — commit `da788e7f` en `dev` + push `5592d5e6..da788e7f`. Árbol del worktree revertido a limpio (solo untracked nuevos: `.kiro/specs/refactor-feed-frontend/`, `.omo/*`).

## STAGED overview.md (copiar a .kiro/specs/refactor-feed-frontend/overview.md)

# Refactor Feed Frontend - Overview

**Versión:** 1.0
**Fecha:** 2026-10-01
**Ubicación:** `apps/frontend/src` (servido por `apps/backend`, `apps/ingestion-telegram`, `apps/feed-publisher`, `apps/scheduling-posts`)
**Nota:** documento CRUDO — describe solo lo que hay hoy. Cero planes futuros (van en `refactor.md`).

## 1. Ruta

- `src/app/router/routes.tsx:32` — `{ path: 'feed', element: <FeedPage/> }` dentro de `<RootLayout/>`.
- `routes.tsx:33-34` — `/profiles` y `/crypto-news` son `<Navigate to="/feed">` (redirects de bookmarks).
- `src/app/layouts/root-layout.tsx:7` — nav `Feed` + `<Outlet/>`.

## 2. Hub `pages/feed` (601 líneas)

`src/pages/feed/index.tsx` — `FeedPage`. Composición de arriba abajo:

1. `<FeedSessionsSection/>` (sesiones, arriba del todo).
2. Header + botón Manage Sources + `<ManageFeedSourcesModal/>`.
3. Stats cards + filtros (source / search / phrase).
4. Recent messages (`type=crypto-news` pineado, 500, álbumes por `groupedId`, 10/pág, Lightbox).
5. Sidebar details: moved-notice keywords (dispara `open-session-keywords`) + `<ContentFilterManager/>` + `<MatchingToggleButton/>` + `<FeedQueueStatsStrip/>` + `<QueueView/>` + `<BlockedPostsList/>` + `<LlmConfigForm/>` + `<PromptTemplates/>` + `<SchedulingManager/>` + `<SchedulingRotationConfigForm/>` + `<FeedThreadsStubSection/>`.

- Tests: `__tests__/feed-page.test.tsx`, `__tests__/llm-config.test.tsx` (no montados).

## 3. `widgets/feed-sessions` (todo montado, nada muerto)

| Archivo                                  | Rol                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `index.ts` (13)                          | Barrel                                                                                 |
| `ui/feed-sessions-section.tsx` (202)     | Contenedor `id="publishing-sessions"`: picker + tabs + escucha `open-session-keywords` |
| `ui/session-window.tsx` (332)            | Draft staged + Save/Delete/Activate + template save/load/delete                        |
| `ui/session-tabs.tsx` (796)              | `SESSION_TABS` Overview\|Sources\|Keywords\|Filters\|LLM\|Target + paneles             |
| `ui/session-management-panel.tsx` (232)  | Crear+listar+activar/borrar inline en Overview (sin modal)                             |
| `ui/recent-with-badges.tsx` (152)        | Recent-20 con Badge de estado + modal Details                                          |
| `__tests__/feed-sessions.test.tsx` (727) | 32 tests jsdom (no montado)                                                            |

Nombres legacy vigentes: hooks aún `useProfile*`, keys duales `feedSessionKeys`/`profileKeys`, tipos duales `Feed*`/`Profile* (@deprecated)`.

## 4. `features/` (4 slices)

### 4.1 `feed-publisher` — keywords/blacklist/phrases/llm/queue (mezcla legacy + nuevo)

- `api/keywords-api.ts`, `api/blacklist-api.ts` — CRUD hacia `/feed-publisher/keywords|blacklist` (backend `:3030` legacy).
- `api/phrases-api.ts` — lista/search/conflict-check hacia `/feed-publisher/phrases*` (legacy).
- `api/llm-config-api.ts` — `LlmConfig` (`dailyCap`, `dailyResetUtcHour`, `randomDelayMinMs/MaxMs`, `llmMaxAttempts`), `MatchingConfig`, `PipelineFlagsView`, templates hacia `/feed-api/*` (feed-publisher `:3040`).
- `api/queue-api.ts` — lista/counts/cancel legacy (`/feed-publisher/queue*`) + stats nuevo (`/feed-api/api/queue/stats`).
- `api/threads-stub-api.ts` — probe `GET /feed-api/api/threads` (501 resuelto-no-lanzado).
- `model/`: `use-keywords.ts`, `use-blacklist.ts`, `use-phrases.ts` (poll 10s), `use-queue.ts` (10s), `use-llm-config.ts` (flags optimistas), `use-threads-stub.ts`.
- `ui/`: `keywords-manager.tsx` (legacy `@deprecated`, solo barrel), `keywords-section.tsx` (scoped por sesión), `blacklist-manager.tsx` (910), `phrase-form.tsx`, `compound-group-modal.tsx` (AND-groups), `queue-view.tsx` (504), `blocked-posts-list.tsx`, `llm-config.tsx` (Daily cap 1-200, reset 0-23, delay min/max ms), `prompt-templates.tsx` (643), `matching-toggle-button.tsx` (3 flags + badge `pipeline-mode`), `feed-queue-stats-strip.tsx`, `feed-threads-stub-section.tsx`, `source-multi-select.tsx`.

### 4.2 `feed-scheduling` — ads/rotation/media (scheduling-posts, NO backend)

- `api/scheduling-api.ts` — vía `schedulingPath()` hacia `/scheduling-api/api/scheduling/ads*`, `rotation-config`, `media/library*`.
- `model/use-scheduling.ts` — lista/library/rotation (poll 10s) + mutaciones.
- `ui/scheduling-manager.tsx` (1473: create→upload→PATCH, `expiresAt:null`=clear, publish-now), `ui/scheduling-rotation-config-form.tsx`, `ui/scheduling-html-preview.tsx` (sin `dangerouslySetInnerHTML`), `ui/scheduling-button-preview.tsx`.

### 4.3 `feed-filters` — wrapper fino (SIN api/model; delega a `entities/feed`)

- `ui/content-filter-manager.tsx` — regex pattern/replacement/flags `gi`/priority + preview `RegExp` en vivo, props `{channelId}`.

### 4.4 `manage-feed-sources` — sources (ingestion-telegram, NO backend)

- `api/*-feed-source-client.ts` (list/add/update/toggle/delete) hacia `/ingestion-api/feed/sources*`.
- `model/use-feed-sources.ts` (stale 30s) + 4 mutaciones (invalidan `feedKeys.all`).
- `ui/add-feed-source-modal.tsx` (valida `/^-100\d+$/`), `ui/manage-feed-sources-modal.tsx`.

## 5. `entities/` + `shared/api`

- `entities/feed/` — `api/feed-queries.ts` (`feedKeys` raíz `['crypto-news']`, `FeedMessage` con `media`/`linkPreview*`/`formattingEntities`/`groupedId`, `FeedSource`, `ContentFilter`; `fetchFeedMessages` 15s / `fetchFeedSources` 30s / filtros CRUD) + `model/use-feed.ts`.
- `entities/feed-session/` — `api/feed-session-queries.ts` (`FeedSessionView`, `FeedTemplateView`, `MessageStatusView` con badge `Not matched|Pending to publish|Published|Failed|Not found|Blocked by …`, `FilterPreviewView`, `PipelineFlagsView`; 15 fetchers, todos `/feed-api` salvo sources/recents que reusan `entities/feed`) + `model/use-feed-sessions.ts` + `model/feed-session-helpers.ts` (puras: `normalizeFeedSessionName`, `isValidFeedSessionName`, `badgeTone`, `paginate`, `splitKeywordGroups`, `snapshotSessionToTemplate`).
- `shared/api/endpoints.ts` (fuente de verdad) + `feed-publisher-base.ts` (`FEED_PUBLISHER_PREFIX='/feed-api'`) + `scheduling-base.ts` (`SCHEDULING_PREFIX='/scheduling-api'`).

## 6. Matriz de conectividad dev (`:5173` hacia app:puerto vía proxy)

| Sección visible en `/feed`                                                                                        | App que la sirve   | Proxy dev                                                     | Upstream dev |
| ----------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------- | ------------ |
| Messages + sources + media                                                                                        | ingestion-telegram | `/ingestion-api/*` hacia `/api/*`                             | `:3031`      |
| Queue legacy, keywords, blacklist, phrases, filtros                                                               | backend            | `/crypto-news-publisher`, `/crypto-news/*`, `/feed-*`, `/api` | `:3030`      |
| Matching config/health, LLM config/flags/models/templates, queue stats, sessions, message status, filters preview | feed-publisher     | `/feed-api/*` (strip prefijo)                                 | `:3040`      |
| Ads, rotation-config, media library                                                                               | scheduling-posts   | `/scheduling-api/*` (strip prefijo)                           | `:4080`      |
| Realtime / socket                                                                                                 | backend WS         | `/socket.io` (ws)                                             | `:3030`      |

Nota staging/prod: tripletes `:3040/:3041/:3042` (feed-publisher), `:4080/:4081/:4082` (scheduling-posts), `:3031/:3032/:3033` (ingestion por env); `/feed-api` y `/scheduling-api` sin bloque nginx en prod (solo dev).

## 7. Vecinos (una línea cada uno, NO inventariados)

- `/threads` (`features/threads-publisher`, `entities/threads`) comparte shapes keywords/blacklist/llm con `/feed`.
- `/playground` (prompt playground) consume preview LLM del mismo `LlmConfig`.
- `widgets/template-dashboard` — verificado: cero imports desde `/feed`; solo vive en `/templates`.

## 8. Explícitamente fuera de este overview

`kol-system` (`:3050`), `market-data` (`:4000`), dexter/telegram-bots-gateway, backend KOL/vip-calls/tokens. Plan futuro: `refactor.md`.

## STAGED refactor.md (copiar a .kiro/specs/refactor-feed-frontend/refactor.md)

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
- D11 Rename de wire **completo ya** con **dual-serve** (precedente P41): `crypto-news`→`feed` (SSE `messageType`, `contentType`, rutas), `/api/content-templates`→`/api/templates`, `useProfile*`→`useSession*`, keys `profileKeys`→`feedSessionKeys`.
- D12 **`LlmConfig` slim**: `defaultTemplateId`, `llmEnabled`, `llmMaxAttempts`, model/tokens (vía ai-ml). dailyCap/reset/delay→pacing; publishingEnabled+targetChannel→bindings de publishing-queue.

## Lenguaje ubicuo objetivo (1 responsabilidad por slice)

- `Session` (tab viva: template cargado o ad-hoc, toggles de sources, keywords propias, switches, scheduling propio, N targets) — concepto `/profiles` eliminado.
- `Template` (snapshot guardado: todo menos nombre/targets; reusable GLOBAL).
- `feed` (reemplaza `crypto-news` en tipos, rutas, `type=` y display).
- `Queue` (pacing + countdown; vive en publishing-queue, se muestra como badges en messages).
- `Publishing` (delivery: caps, delays, bindings por bot+canal; vive en publishing-queue).

## Rondas abiertas (una-a-una, con sugerencia inicial)

- R1 resuelta 2026-10-01: el value object se llama **`DeliveryPolicy`** (no `PublishPacing`): `delayMinMs/delayMaxMs/dailyCap/resetHour` por binding (bot+canal) + fallback global. Dueño descartó `PublishThrottle/DispatchWindow/SendBudget/PublishCadence`.
- R2 resuelta 2026-10-01: la cola se muda de feed-publisher a publishing-queue **tal cual** (mismos nombres `PublisherQueueEntry/QueueManager`, tope 36, TTL 24h, dreno 1/min); `etaMs/deadlineAt` se añaden al mudar; rewire a ai-ml/gateway en fase siguiente. Rutas: mismo sufijo (`/api/queue`, `/api/queue/stats`, `DELETE /api/queue/:id`) cambiando solo prefijo `/feed-api`→`/scheduling-api` con dual una fase.
- Árbol publishing-queue FIJADO 2026-10-01 (5 BCs + shared): `health/`, `scheduled/` (`ScheduledPost`, 3 use-cases, cron 1min, controller), `scheduling/` (`RotationPost` rename de `ScheduledAd`, `SchedulingConfig`+DeliveryPolicy, `RotationDeciderService`, `DeliveryPoliciesController`, `RotationMediaEntry`), `queue/` (mudada + etaMs/deadlineAt), `gateway/` (dueño único transporte, absorbe `telegram/`), `shared/`.
- Regla hora exacta FIJADA 2026-10-01: post con hora exacta salta delay aleatorio, respeta dailyCap (HOLD+tardío) y resetHour; UI avisa zona de riesgo.
- R2 Campos queue: `etaMs/deadlineAt` en `PublisherQueueEntry` + migración de `QUEUE_MAX_PENDING=36`/TTL al mover a publishing-queue. Sugerencia: mover schedulers tal cual, renombrar después.
- R3 resuelta 2026-10-01: tipos frontend espejo 1:1 sin alias — `FeedSession` (borra View/Profile), `FeedTemplate`, `FeedMessage` con `type='feed'`, `FeedQueueEntry` (+etaMs/deadlineAt) + `QueueBadge {status, etaLabel}` en `features/publishing-queue`; keys `feedSessionKeys` (borra `profileKeys`).
- R4 resuelta 2026-10-01: badge pending `~Xs` (<60s) → `~Xm` (<60min) → `~Xh`, más `#N` posición (`~45s · #3`); helper puro `formatQueueEta()`; poll 10s existente.
- R5 resuelta 2026-10-01: orden Overview|Sources|Keywords|Filters|Control|LLM|Target; la tab de salida se llama **Control** (switches matching/LLM/publishing + estado cola + DeliveryPolicy), no Queue.
- R6 resuelta 2026-10-01: `feed-publisher` = contenido (keywords, blacklist, phrases, filters, matching, sessions, keywords-section); `publishing-queue` (nuevo) = delivery (queue-view, badges, switches Control, delivery-policy-form, stats, prompt-templates, matching-toggle).
- Rondas abiertas restantes: ninguna (R1–R6 todas RESUELTAS).
- R-a learnings 2026-10-02: `src/telegram/` real = 38 files (12 live-target + 12 live-merge + 26 DELETE incl. 2 wiring specs); `telegram.module.ts` LIVE pese a @deprecated (rewire app.module.ts:16 + target.module.ts:3,30 antes de borrar); solo `SCHEDULING_POSTS_*` renombra (dominio intacto); sin deploy workflow para publishing (GHCR manual); nginx sin bloque /scheduling-api (ADD, no rename); tripletes valores intactos; VITE\_ rename exige Dockerfile/run-env; gateway CLIENTS droplet suma id nuevo.
- High-accuracy review: 7 rounds (FAIL×2 verdad+build → F+G → FAIL r2 → B1/B2/B3 → FAIL r3 split → Fase 0 → FAIL r4 higiene → fixes S1-S8 → FAIL r5 → deltas → FAIL r6 → deltas → **PASS r7**). Fase-0 Momus: FAIL (3B+4N) → fixes → **PASS**. Specs worker-safe; riesgo Medium.
