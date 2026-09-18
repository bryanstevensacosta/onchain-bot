---
slug: threads-publisher
status: approved 2026-09-15 (user: "está bien")
intent: clear
pending-action: done → plan .omo/plans/threads-publisher.md generated
approach: clonar crypto-news-publisher+integration+filters-slice a src/threads/{publisher,integration}/ (+alias threads/*), renombrar a threads-*, escribir solo ThreadsApiPublisherAdapter + ThreadsTokenRefresher; frontend sección /threads clonada; tablas threads_* en backend DB
---

# Draft: threads-publisher

## Components (topology ledger)
| id | outcome | status | evidence |
| C1 ubicación | `src/threads/{publisher,integration}/` + alias `threads/*` (no standalone, no refactor previo) | active | costo standalone ~35 ficheros verificado ses_f5b8a0b00ffeyanqKEhwAd7zNH; acoplo solo nominal |
| C2 backend publisher BC | `threads/publisher/` clon de 76 files: 6 tablas threads_*, enqueue cap 36, drain 1/min, TTL 24h, 5 controllers, sender Threads | active | apps/backend/src/telegram/crypto-news-publisher/ (76 .ts) |
| C3 backend integration BC | `threads/integration/`: fetch ingestion HTTP → filter (reusado) → match propio → enqueue; SSE+polling | active | .../crypto-news-integration/ (19 .ts) |
| C4 adapter + token | ThreadsApiPublisherAdapter (2-step, poll fields=status) + ThreadsTokenRefresher (60d/≥24h) — único código nuevo real | active | threads-meta-test/publish.mjs + exchange.mjs (probado en vivo id 18110023205593536) |
| C5 frontend /threads | página + entities/threads + features/threads-publisher + filtros reusados; 3 componentes tal cual | active | apps/frontend 56-61 files; ContentFilterManager ya parametrizado |
| C6 UL + rutas | glosario 11 términos + 13 rutas backend + página/proxies frontend ratificados | active | draft decision log abajo |

## Open assumptions (announced defaults)
| assumption | default | rationale | reversible? |
| DB | tablas `threads_*` en backend DB, migraciones TypeORM espejo | sin deployable propio no hay DB propia | sí (migración) |
| Keywords/blacklist | tablas propias (Q1) | destinos con reglas distintas; norma no-compartir-BCs | sí |
| Filters/sources | reutilizar servicio+tabla y HTTP ingestion (Q2, Q3 implícito) | keyed by channel, agnósticos al destino | sí |
| Config destino | sin target, cuenta única (Q3) | token define la cuenta | sí (columna) |
| Ads/media | OUT | no pedidos; media diferido como spike | sí |
| Tests | tests-after espejo + QA agent | espejo crypto-news tiene specs; TDD sobre clon mecánico frena sin ganar | sí |

## Findings (cited)
- Publisher: module wiring `crypto-news-publisher.module.ts:181`; enqueue cap `enqueue-matching-message.use-case.ts:46,53`; drain `process-next-queued-article.use-case.ts:59,82`; cron lock 7_421_371 `publisher-cron.scheduler.ts:41,69`; TTL `expire-stale-queue-entries.scheduler.ts:25,44`; LLM `crypto-news-llm.adapter.ts:31,51`; sender `bot-api-crypto-news-publisher.adapter.ts:51`; phrase registry `phrase-registry.service.ts:39`; 5 controllers `api/http/*.controller.ts`; 6 entidades tablas `crypto_news_publisher_*`.
- Integration: module `:91`; FilteredCryptoNewsService `:55`; ingestion client `:81`; SSE handler `:46`; cron `enqueue-matching-cron.scheduler.ts:43,55,71-80`; MatchingConfig entity + controller `crypto-news/matching` `:50,51`.
- Filters slice: ContentFilterService `content-filter.service.ts:30,72`; 5 filter use-cases; tabla `channel_content_filter_configs`.
- Shared: LlmPort `shared/llm/llm.port.ts:52`; throttle `shared-throttle-scheduler.service.ts:49,30`; slot arbitrator + TelegramPublisherPort (telegram/shared); dedup `blocking-failure-reasons.ts:15,52`.
- Registry: `shared/common/persistence/entities.ts:51-91` (39 entities); migraciones espejo listadas en explore.
- Frontend: routes `routes.tsx:8,19`; nav `root-layout.tsx:7`; hub `pages/crypto-news/index.tsx:131-562` 6 details; queries `crypto-news-queries.ts:85-169` (7 endpoints); keys `['crypto-news']`/`['crypto-news-publisher',...]`; 10s polls; toggles `matching-toggle-button.tsx:10-23`; LLM `llm-config-api.ts:118-185`; proxy `vite.config.ts:17-47`; ENDPOINTS `endpoints.ts:85-97`.
- Standalone tax + Threads sin forcing functions: verificado ses_f5b8a0b00ffeyanqKEhwAd7zNH. Spike: `threads-meta-test/` (2-step, fields=status, quota 500 Meta-side).

## Decisions (with rationale)
- Q0 despliegue: BCs en backend (user). Sin forcing function Threads; tax standalone inaceptable para clon.
- Q1/Q2/Q3: propias / reutilizar / sin-target (user, recomendados).
- Estructura: `src/threads/{publisher,integration}/` + alias (default B adoptado por gusto desacoplo user; no toca código existente).
- Rutas backend: `threads-publisher/keywords|blacklist|phrases|queue|llm/*`, `threads/matching/config|health`. Sin rutas filtros/sources.
- UL 11 términos + frontend `/threads` ratificados salvo veto.
- Sin refactor previo: acoplo nominal; publishing-service desaconsejado (XL+riesgo+divergencia).

## Scope IN
- `src/threads/publisher/` (dominio+app+infra+api espejo, sender Threads, 6 tablas+migraciones, 5 controllers, 2 schedulers, LLM adapter propio con prompt Threads).
- `src/threads/integration/` (MatchingConfig+controller, ingestion client reuse pattern, FilteredThreadsService, SSE handler + polling scheduler).
- `ThreadsApiPublisherAdapter` + `ThreadsTokenRefresher` + `THREADS_*` en app.config + `.env.example` + templates.
- Frontend: `pages/threads/`, `entities/threads/`, `features/threads-publisher/`, `features/threads-filters` (solo re-export o wrapper fino si hace falta), route+nav, ENDPOINTS.threads, proxy Vite+nginx, filtros/sources reusados por import.
- Tests-after espejo + migraciones + docs runbook (token setup) + go/no-go cierre vs spike.

## Scope OUT (Must NOT have)
- NO `apps/threads-publisher/`, NO DB propia, NO Dockerfile/compose/workflow/proxy nuevos de app, NO SSE propio.
- NO tocar `telegram/crypto-news-*`, `telegram/ingestion/*` (solo importar), `apps/ingestion-telegram`, `apps/frontend` fuera de lo listado.
- NO ads, NO media/carrusel, NO App Review, NO multi-cuenta, NO `npm install` de deps nuevas (fetch nativo).
- NO compartir entidades entre BCs (tablas threads_* propias salvo filters reusado por puerto).
- NO publicar en cuenta productiva sin confirmación; NO commitear tokens.

## Open questions
- Ninguna bloqueante. Test strategy tests-after propuesta; veto con okay si se quiere TDD/none.

## Approval gate
status: review-passed 2026-09-15 — MOMUS-OKAY + REVIEW2-OKAY (4 rondas opencode; 16+9+4 issues + 2 minors plegados). Plan handoff-ready en `.omo/plans/threads-publisher.md`. Pending: okay explícito → $start-work.
