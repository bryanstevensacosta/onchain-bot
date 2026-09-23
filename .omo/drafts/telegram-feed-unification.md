---
slug: telegram-feed-unification
status: plan-written
intent: clear
pending-action: none — plan written at .omo/plans/telegram-feed-unification.md (11 todos + F1-F4); routes decision A (owner 2026-09-21); scope expanded to telegram-feed unification per owner request
approach: Wave 0 moves puros (registry/feed/retention/core, telegram/ eliminado) luego waves ingestion-first (sources+messages+SSE) then backend-rewire; dedup wiring + dead-port removal last
tree-confirmed 2026-09-21: registry (catálogo) / feed (dato caliente) / retention (ciclo inverso) / core (motor); stream-media-shared-health-metrics-debug intactos; frontera core=hace vs shared=ayuda
---

# Draft: telegram-feed-unification

## Components (topology ledger)
- C1 | Registro KOL (kols + CRUD/lifecycle API) en ingestion-DB | status: active | evidence: backend kol/identity/* (table kols), ingestion crypto-news.controller.ts (patrón POST/GET/PATCH-toggle/DELETE a espejar)
- C2 | Raw fetch KOL (kol_messages + persist en coordinator, SIN media) | status: active | evidence: message-persistence.coordinator.ts (rama kol sin persistir), adapter gate líneas 328-332 (solo crypto-news descarga)
- C3 | Backend consume crudo (SSE con texto para KOL; orchestrator/extraction/parsing casi intactos) | status: active | evidence: kol-ingestion-orchestrator.use-case.ts (direct calls fix-1), payloadToRawMessage text ?? ''
- C4 | Reputación/scoring/known-lists/stats quedan en backend | status: active | evidence: kol/reputation/*, DefaultKolReputationAdapter, kol_known_lists
- C5 | Dedup cableado (isDuplicate en coordinator, ambas vías) + eliminar SourceAggregatorPort muerto | status: active | evidence: deduplication.service.ts (unwired), source-aggregator.port.ts (cero consumidores)
- C6 | Retención 72h kol_messages en janitor existente | status: active | evidence: retention-cleanup.scheduler.ts (messages+media, lock 9_421_373)

## Open assumptions (announced defaults)
- kol_messages schema espeja crypto-news_messages (id uuid, channel_id, message_id unique, content text RAW, ingested_at clock, sin media FK) | rationale: un solo janitor, un solo patrón | reversible: parcial (migración con down)
- Backend lee identity vía HTTP client nuevo (puertos KolRepository se mantienen, impl cambia a HTTP) | rationale: no reescribir 18 archivos consumidores | reversible: sí
- kol_known_lists + kol_reputations + stats-stub NO se mueven | rationale: lógica de negocio backend (C4 acordado) | reversible: n/a
- Test strategy: TDD servicios nuevos + tests-after integración, Jest co-locado (convención repo) | reversible: n/a

## Findings (cited)
- kols table backend: kol_id PK varchar(64), handle/title/is_active/lifecycle_status/last_ingested_at (typeorm entity kol/identity); KolSeeder eliminado 2026-09-06 (alta solo por POST)
- Ingestion lee hoy: GET {BACKEND_URL}/telegram-kol/identity/kols/active/ids (sin timeout, fail-open []) + registro inverso backend→ingestion POST /api/ingestion/backends/register (a eliminar)
- Texto KOL hoy: solo args en call-stack (SSE text undefined→'', eventos sin texto, agregados sin texto); 7 comentarios Per fix-1 blindan ToS §4.3
- Ingestion dedup muerto: isDuplicate 0 callers prod; backend KOL sin dedup (claves naturales); SourceAggregatorPort 0 consumidores
- KOL nunca descarga media (gate isCryptoNewsChannel); retention NO toca sources; refresh 5min inefectivo en frío (updateSubscribedChannels solo si previousTotal>0)
- Cross-BC: 34 hits kol/identity en 18 archivos + reputation/scoring/dashboard consumidores

## Decisions (with rationale + owner)
- Q1 = B (owner 2026-09-21): persistir texto KOL + SSE con texto para KOL; SIN media KOL (solo crypto-news). Blast-radius ToS aceptado por operador.
- Q2 = A (owner 2026-09-21): mudanza completa kols + lifecycle + CRUD a ingestion; backend depreca endpoints y lee por HTTP.
- C2 media: NO (owner): KOL sin media, gate intacto.
- C5 dedup: SÍ (owner): cablear isDuplicate ambas vías + eliminar puerto muerto.

## Scope IN
- C1–C6 según decisiones; migración datos kols (seed 45 + filas vivas) a ingestion-DB; deprecación endpoints backend (501 como patrón crypto-news); drop tabla kols en backend vía migración; OpenAPI nuevos endpoints; docs (NUEVOS archivos; overview.md del usuario NO se toca).

## Scope OUT (Must NOT have)
- NO métricas/alertas nuevas; NO tocar scoring/reputación/known-lists/stats-stub; NO media KOL; NO replay/Last-Event-ID/backfill real; NO PublishingMode ni flags; NO credenciales MTProto ni 2ª instancia; NO overview.md del usuario; NO migración Option-2 del plan anterior (cerrado).

## Open questions
- Ninguna pendiente (Q1/Q2/C2/C5/C6 respondidas 2026-09-21).

## Approval gate
status: plan-written; execution approval pending (start work vs high-accuracy review)
expansion approved by owner 2026-09-21: telegram-feed unification (single sources/messages/media tables, /api/feed/* renames incl. HTTP, uploads/feed/media with /api/media intact, dead files deleted)
