# threads-publisher — Draft

status: awaiting-approval
pending*action: write .omo/plans/threads-publisher.md
Q1 RESOLVED: BCs en backend (user chose recommended 2026-09-15). C1 locked: telegram/threads-publisher + threads-integration(+filters slice), tablas threads*\* en backend DB. NO apps/threads-publisher/, NO DB propia, NO pipeline nuevo.

## Intent routing

Intent: CLEAR (tie-break: proposal exists + open forks). Research done in one wave (3 explorers).
Defaults adopted where reversible; distribution/packaging fork survives as the ONE owner-question.

## Key facts (verificados)

- Backend crypto-news = 195 .ts en 4 módulos: publisher 76 (6 tablas, enqueue cap 36, drain 1/min lock 7_421_371, TTL 24h, 5 controllers, LLM adapter, BotApi sender) + integration 19 (fetch→filter→match, SSE + polling fallback, MatchingConfig) + ads 65 (omitible) + ingestion/crypto-news filters 35 (1 tabla + ContentFilterService + 5 use-cases). Tablas crypto-news-\* en backend DB (registry 39 entities); sources/messages/media viven SOLO en ingestion DB (migración 1860000000001).
- Frontend crypto-news = 56-61 files: hub page 6 `<details>`, entities (keys `['crypto-news']`, endpoints `/ingestion-api/crypto-news/*`, `/crypto-news/*`), features publisher/filters/sources/ads, proxy+ENDPOINTS. Clon mecánico: copiar dirs, reemplazar prefijos endpoints + query-keys + copy; ContentFilterManager/SourceMultiSelect/DetailsModal ya parametrizados (reuso tal cual).
- Standalone cuesta ~35 ficheros scaffold + tax operativo (2º pipeline GHCR, 2ª DB + janitor, split puertos 3031/3032, CORS/env triple, contrato SSE lossy, drift: root scripts/lint-staged ni cubren ingestion).
- Ingestion se separó por 5 forcing functions: sesión MTProto única (AUTH_KEY_DUPLICATED), fan-out N-backends, ownership de media, DB propia + janitor 72h, anti-ban. Threads: NINGUNA (spike prueba HTTPS stateless + token, sin sesión/sockets/media). README spike §8 ya dice: si GO, clonar crypto-news-publisher como BC.

## Components (topology lock)

| id | outcome | status | evidence |
| C1 forma de despliegue | standalone `apps/threads-publisher/` vs BCs en backend | FORK (Q1) | costo standalone verificado arriba |
| C2 backend threads BCs | publisher+integration(+filters slice) clonados, sender = ThreadsApiPublisherAdapter | active | mapa backend ses_f5b8a0af3ffegXtP21Q3i27lud |
| C3 lenguaje ubicuo | términos Threads-\* definidos (default propuesto) | active | propuesta abajo |
| C4 frontend /threads | sección clonada, componentes genéricos reusados | active | mapa frontend ses_f5b8a0aefffegryu1cYoCAgbFY |
| C5 estrategia sin-reescritura | clon mecánico + 1 adapter nuevo + token refresh | active | norma repo: no compartir entidades entre BCs (duplicar es idiomático) |
| C6 fuente de contenido | mismos messages de ingestion-telegram vía HTTP (sin tablas nuevas de ingesta) | active | Opción A filter on-read |

## Open-assumptions (defaults adoptados, vetables en gate)

- Tablas `threads_*` en backend DB (no DB propia: solo con deployable propio).
- Keywords/blacklist/colas/flags SEPARADOS (`threads_*`), no compartidos con crypto-news (norma anti-patterns: no compartir entidades entre BCs; pipelines con destinos distintos).
- Frontend: sección `/threads` separada (no fusionar en crypto-news): destinos y flags distintos; fusión enreda colas/config.
- Fuente: mismos messages RAW de ingestion-telegram (GET existente); threads-matching con sus propias reglas.
- Ads: OUT (solo si se pide monetización Threads).
- Contenido inicial: TEXT plano (media/carrusel diferido, como el spike).

## Ubiquitous language (propuesto, a ratificar en plan)

ThreadPost (contenido candidato) · ThreadContainer (container API Meta, id + status) · ThreadsQueueEntry (cola, cap 36 espejo) · ThreadsKeyword / ThreadsBlacklistPhrase (matching propio) · ThreadsMatchingConfig (flag matchingEnabled) · ThreadsLlmConfig (llmEnabled/publishingEnabled + dailyCap + delays) · ThreadsPromptTemplate · ThreadsApiPublisherPort / ThreadsApiPublisherAdapter (2-step + poll fields=status) · ThreadsTokenRefresher (long 60d, refresh ≥24h) · thread.enqueued / thread.published / thread.failed (estados, espejo de queue statuses).

## Rutas propuestas (espejo crypto-news, a ratificar)

Backend (`apps/backend/src/telegram/threads-*`):

- `threads-publisher/keywords` CRUD + `/batch` · espejo `crypto-news-publisher/keywords`
- `threads-publisher/blacklist` CRUD + `/batch`
- `threads-publisher/phrases`, `/search`, `/conflict-check`
- `threads-publisher/queue`, `/counts`, DELETE `{id}` (cancel)
- `threads-publisher/llm/config` (GET/PATCH), `llm/models`, `llm/templates` CRUD
- `threads/matching/config` (GET/PATCH), `threads/matching/health`
- Filters: REUSAR `crypto-news/sources/{channelId}/filters` (sin rutas nuevas) — Q2
- Sources/messages: REUSAR `GET ingestion:3031/api/crypto-news/sources|messages` (sin rutas nuevas)
  Frontend: página `/threads` + nav "Threads"; entities/threads keys `['threads']`; publisher `/threads-publisher/*`, matching `/threads/matching/*`; proxy Vite+nginx para ambos prefijos → :3030.

## Lenguaje ubicuo propuesto (a ratificar)

ThreadPost (texto candidato de un channel para Threads) · ThreadContainer (container Meta efímero: creation_id + status; se persiste creation_id + published id en la queue para traza) · ThreadsQueueEntry (PENDING/PUBLISHED/BLOCKED/FAILED, cap 36 espejo) · ThreadsKeyword / ThreadsBlacklistPhrase (reglas propias) · ThreadsMatchingConfig (1 row, matchingEnabled) · ThreadsLlmConfig (llmEnabled/publishingEnabled + dailyCap + delays + llmMaxAttempts) · ThreadsPromptTemplate · ThreadsApiPublisherPort/Adapter · ThreadsToken (VO: access_token + expires_in + threads_user_id) · ThreadsTokenRefresher · ThreadsAccount (cuenta única conectada).

## Resoluciones ronda 2 (2026-09-15, user eligió recomendados)

Q1: keywords/blacklist en tablas propias `threads_*` (matching independiente por destino).
Q2: reutilizar ContentFilterService + `channel_content_filter_configs` (sin tablas ni rutas de filtros nuevas).
Q3: cuenta única, `ThreadsLlmConfig` SIN campo target (el token define la cuenta).
Rutas + UL ratificados salvo veto (nombres listados arriba).

## Estructura carpetas (corrección a propuesta user 2026-09-15)

Propuesta user: `src/threads/{publisher,keywords,blacklist,phrases,queue,llm,matching,filters,sources}/`.
Arreglos:

1. NO aplanar por feature: keywords/blacklist/phrases/queue/llm viven DENTRO del BC publisher (son sus agregados + controllers); matching/ DENTRO del BC integration; espejo exacto crypto-news (cohesión + wiring Nest por módulo).
2. ELIMINAR `filters/` y `sources/`: filtros reusados (Q2), sources en ingestion-telegram (replicar tablas prohibido, migración 1860000000001).
3. Ubicación recomendada: `telegram/threads-publisher/` + `telegram/threads-integration/` (alias `telegram/*` gratis, espejo mecánico). Alternativa aceptable: `src/threads/{publisher,integration}/` + alta de alias `threads/*` en tsconfig.
4. Rutas/tablas/UL sin cambios.

## Refactor previo (debate 2026-09-15)

User propone: refactorizar por features o extraer `apps/publishing-service/`.
Veredicto: publishing-service MUY complejo (tax 35 ficheros + extracción + contratos inter-servicio + migración datos + doble deploy + divergencia inevitable Bot API vs Graph API). El acoplamiento telegram/threads-\* es NOMINAL (nombre carpeta), no de dependencias: threads BC importaría shared/llm, telegram/shared ports, ingestion slice — nunca el sender BotApi (destino se intercambia por puerto). telegram/ = agrupador "familia origen".
Opciones: A) sin refactor (recomendado) B) rename barato: `src/threads/{publisher,integration}/` + alias (no toca código existente) C) extraer kernel: nada que extraer (ya existe en shared/) D) publishing-service: desaconsejado.
Default adoptado: B (satisface gusto desacoplo, costo ~1 línea tsconfig + rutas), vetable en gate.

## Approval gate

status: awaiting-approval — brief abajo; pending: okay explícito → scaffold `.omo/plans/threads-publisher.md` → Metis → todos → TL;DR.
status: awaiting Q1 answer → luego brief + okay explícito → scaffold `.omo/plans/threads-publisher.md`.
