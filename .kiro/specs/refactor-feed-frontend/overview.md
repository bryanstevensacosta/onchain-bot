# Refactor Feed Frontend - Overview

**Versión:** 1.0
**Fecha:** 2026-10-01
**Ubicación:** `apps/frontend/src` (servido por `apps/backend`, `apps/ingestion-telegram`, `apps/feed-publisher`, `apps/scheduling-posts`)
**Nota:** documento CRUDO — describe solo lo que hay hoy. Cero planes futuros (van en `refactor.md`).

## 1. Ruta

- `src/app/router/routes.tsx:32` — `{ path: 'feed', element: <FeedPage/> }` dentro de `<RootLayout/>`.
- `routes.tsx:33-34` — `/profiles` y `/crypto-news` son `<Navigate to="/feed">` (redirects de bookmarks).
- `src/app/layouts/root-layout.tsx` — nav Feed (:7) + `<Outlet/>` (:45).

## 2. Hub `pages/feed` (601 líneas)

`src/pages/feed/index.tsx` — `FeedPage`. Composición de arriba abajo:

1. `<FeedSessionsSection/>` (sesiones, arriba del todo).
2. Header + botón Manage Sources + `<ManageFeedSourcesModal/>`.
3. Stats cards + filtros (source / search / phrase).
4. Recent messages (`type=crypto-news` pineado, 500, álbumes por `groupedId`, 10/pág, Lightbox).
5. Sidebar details: moved-notice keywords (dispara `open-session-keywords`) + `<ContentFilterManager/>` + `<MatchingToggleButton/>` + `<FeedQueueStatsStrip/>` + `<QueueView/>` + `<BlockedPostsList/>` + `<LlmConfigForm/>` + `<PromptTemplates/>` + `<SchedulingManager/>` + `<SchedulingRotationConfigForm/>` + `<FeedThreadsStubSection/>`.

- Tests: `__tests__/feed-page.test.tsx`, `__tests__/llm-config.test.tsx` (no montados).

## 3. `widgets/feed-sessions` (todo montado, nada muerto)

| Archivo                                  | Rol                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `index.ts` (13)                          | Barrel                                                                                           |
| `ui/feed-sessions-section.tsx` (202)     | Contenedor `id="publishing-sessions"`: picker + tabs + escucha `open-session-keywords`           |
| `ui/session-window.tsx` (332)            | Draft staged + Save/Delete/Activate + template save/load/delete                                  |
| `ui/session-tabs.tsx` (796)              | `SESSION_TABS` overview\|sources\|keywords\|filters\|llm\|target (display capitalised) + paneles |
| `ui/session-management-panel.tsx` (232)  | Crear+listar+activar/borrar inline en Overview (sin modal)                                       |
| `ui/recent-with-badges.tsx` (152)        | Recent-20 con Badge de estado + modal Details                                                    |
| `__tests__/feed-sessions.test.tsx` (727) | 32 tests jsdom (no montado)                                                                      |

Nombres legacy vigentes: hooks aún `useProfile*`, keys duales `feedSessionKeys`/`profileKeys`, tipos duales `Feed*`/`Profile* (@deprecated)`.

## 4. `features/` (4 slices)

### 4.1 `feed-publisher` — keywords/blacklist/phrases/llm/queue (mezcla legacy + nuevo)

- `api/keywords-api.ts`, `api/blacklist-api.ts` — CRUD hacia `/feed-publisher/keywords|blacklist` (backend `:3030` legacy vía keywords-api.ts; dual: session-scoped fetchPublisher\* van por /feed-api `:3040`).
- `api/phrases-api.ts` — lista/search/conflict-check hacia `/feed-publisher/phrases*` (legacy).
- `api/llm-config-api.ts` — `LlmConfig` (12 campos: id, defaultTemplateId, targetChannel, llmEnabled, publishingEnabled, rejectNonLatin, dailyCap, dailyResetUtcHour, randomDelayMinMs/MaxMs, llmMaxAttempts, updatedAt), `MatchingConfig`, `PipelineFlagsView`, templates hacia `/feed-api/*` (feed-publisher `:3040`).
- `api/queue-api.ts` — lista/counts/cancel legacy (`/feed-publisher/queue*`) + stats nuevo (`/feed-api/api/queue/stats`).
- `api/threads-stub-api.ts` — probe `GET /feed-api/api/threads` (501 resuelto-no-lanzado).
- `model/`: `use-keywords.ts`, `use-blacklist.ts`, `use-phrases.ts` (poll 10s), `use-queue.ts` (10s), `use-llm-config.ts` (flags optimistas), `use-threads-stub.ts`.
- `ui/`: `keywords-manager.tsx` (legacy `@deprecated`, solo barrel), `keywords-section.tsx` (scoped por sesión), `blacklist-manager.tsx` (935), `phrase-form.tsx`, `compound-group-modal.tsx` (AND-groups), `queue-view.tsx` (504), `blocked-posts-list.tsx`, `llm-config.tsx` (Daily cap 1-200, reset 0-23, delay min/max ms), `prompt-templates.tsx` (643), `matching-toggle-button.tsx` (3 flags + badge `pipeline-mode`), `feed-queue-stats-strip.tsx`, `feed-threads-stub-section.tsx`, `source-multi-select.tsx`.

### 4.2 `feed-scheduling` — ads/rotation/media (scheduling-posts, NO backend)

- `api/scheduling-api.ts` — vía `schedulingPath()` hacia `/scheduling-api/api/scheduling/ads*`, `rotation-config`, `media/library*`.
- `model/use-scheduling.ts` — lista/library/rotation (poll 10s) + mutaciones.
- `ui/scheduling-manager.tsx` (1490: create→upload→PATCH, `expiresAt:null`=clear, publish-now), `ui/scheduling-rotation-config-form.tsx`, `ui/scheduling-html-preview.tsx` (sin `dangerouslySetInnerHTML`), `ui/scheduling-button-preview.tsx`.

### 4.3 `feed-filters` — wrapper fino (SIN api/model; delega a `entities/feed`)

- `ui/content-filter-manager.tsx` — regex pattern/replacement/flags `gi`/priority + preview `RegExp` en vivo, props `{channelId}`.

### 4.4 `manage-feed-sources` — sources (ingestion-telegram, NO backend)

- `api/*-feed-source-client.ts` (list/add/update/toggle/delete) hacia `/ingestion-api/feed/sources*`.
- `model/use-feed-sources.ts` (stale 30s) + 4 mutaciones (invalidan `feedKeys.all`).
- `ui/add-feed-source-modal.tsx` (valida `/^-100\d+$/`), `ui/manage-feed-sources-modal.tsx`.

## 5. `entities/` + `shared/api`

- `entities/feed/` — `api/feed-queries.ts` (`feedKeys` raíz `['crypto-news']`, `FeedMessage` con `media`/`linkPreview*`/`formattingEntities`/`groupedId`, `FeedSource`, `ContentFilter`; `fetchFeedMessages` 15s / `fetchFeedSources` 30s / filtros CRUD) + `model/use-feed.ts`.
- `entities/feed-session/` — `api/feed-session-queries.ts` (`FeedSessionView`, `FeedTemplateView`, `MessageStatusView` con badge `Not matched|Pending to publish|Published|Failed|Not found|Blocked by …`, `FilterPreviewView`, `PipelineFlagsView`; 21 fetchers, todos `/feed-api` salvo sources/recents que reusan `entities/feed`) + `model/use-feed-sessions.ts` + `model/feed-session-helpers.ts` (puras: `normalizeFeedSessionName`, `isValidFeedSessionName`, `badgeTone`, `paginate`, `splitKeywordGroups`, `snapshotSessionToTemplate`).
- `shared/api/endpoints.ts` (fuente de verdad) + `feed-publisher-base.ts` (`FEED_PUBLISHER_PREFIX='/feed-api'`) + `scheduling-base.ts` (`SCHEDULING_PREFIX='/scheduling-api'`).

## 6. Matriz de conectividad dev (`:5173` hacia app:puerto vía proxy)

| Sección visible en `/feed`                                                                                        | App que la sirve   | Proxy dev                                                                                                                                                                                                                                                                                                                                            | Upstream dev |
| ----------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Messages + sources + media                                                                                        | ingestion-telegram | `/ingestion-api/*` hacia `/api/*`                                                                                                                                                                                                                                                                                                                    | `:3031`      |
| Queue legacy, keywords, blacklist, phrases, filtros                                                               | backend            | `/api`, `/crypto-news-publisher`, `/feed-publisher` (ojo: va al backend :3030, NO a feed-publisher), `/crypto-news/matching`, `/feed-matching`, `/crypto-news/sources`, `/crypto-news/filters`, `/feed-filters`, `/ops/backups`, `/crypto-news-scheduling`, `/feed-scheduling`, `/threads-publisher`, `/feed-threads-publisher`, `/threads/matching` | `:3030`      |
| Matching config/health, LLM config/flags/models/templates, queue stats, sessions, message status, filters preview | feed-publisher     | `/feed-api/*` (strip prefijo); keywords/blacklist en dual: legacy keywords-api.ts → /feed-publisher/_ (:3030), session-scoped fetchPublisher_ → /feed-api/\* (:3040)                                                                                                                                                                                 | `:3040`      |
| Ads, rotation-config, media library                                                                               | scheduling-posts   | `/scheduling-api/*` (strip prefijo)                                                                                                                                                                                                                                                                                                                  | `:4080`      |
| Realtime / socket                                                                                                 | backend WS         | `/socket.io` (ws)                                                                                                                                                                                                                                                                                                                                    | `:3030`      |

Nota staging/prod: tripletes `:3040/:3041/:3042` (feed-publisher), `:4080/:4081/:4082` (scheduling-posts), `:3031/:3032/:3033` (ingestion por env) (dev :3031 / prod :3032 / staging :3033); `/feed-api` y `/scheduling-api` sin bloque nginx en prod (solo dev).

## 7. Vecinos (una línea cada uno, NO inventariados)

- `/threads` (`features/threads-publisher`, `entities/threads`) comparte shapes keywords/blacklist/llm con `/feed`.
- `/playground` (prompt playground) consume preview LLM del mismo `LlmConfig`.
- `widgets/template-dashboard` — verificado: cero imports desde `/feed`; solo vive en `/templates`.

## 8. Explícitamente fuera de este overview

`kol-system` (`:3050`), `market-data` (`:4000`), dexter/telegram-bots-gateway, backend KOL/vip-calls/tokens. Plan futuro: `refactor.md`.
