# mega-refactor-kol-system - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una app nueva `kol-system` que saca todo lo KOL del monolito: tabla de calls por mención (sin dedup), templates configurables por bot, tracking first-seen y dashboard por template.

**Why this approach:** Va primero por ser el money-path, con red de seguridad reforzada (staging 14 días + canal espejo + rollback ensayado). El diseño pivota del spec original: sin dedup, identidad en ingestion-telegram y classification dentro de templates.

**What it will NOT do:** No toca crypto-news, no mueve providers físicos, no implementa threads (stub 501), no abre MTProto nuevo.

**Effort:** XL (16 todos, 9-10 semanas)
**Risk:** High - piloto sobre el money-path real
**Decisions I made for you:** Reescritura contra el pivot P1-P9 (no spec literal); DDL 17-18 tablas; `?type=kol`; avatar en ingestion-telegram; threads diferidos al Tramo 2.

Your next move: approve — revisión Momus superada tras fixes; listo para $start-work Tramo 1. Full execution detail follows below.

---

> TL;DR (machine): XL effort, High risk (money-path pilot), kol-system app + 16 todos + cutover

## Scope

### Must have

- Nueva app `apps/kol-system/` (:3050/3051/3052) con módulos efectivos: ingestion, extraction, parsing, normalization (índice de menciones, G-12), enrichment (vía `MarketDataPort` dual, G-17), scoring, templates (sin threads, G-11), approval, publishing (multi-bot, C2), tracking (first-seen, G-14), telegram (KOL bot), shared. Ver tree `.omo/reference/mega-refactor-target-tree.md`.
- Divergencias pivot P1–P9 OBLIGATORIAS: sin dedup propia (P1), identity/sources en ingestion-telegram (P4, G-07/G-09), extraction contrato×mención (P5), classification dentro de templates (P6, G-08), puente market-data (P7, G-17), tracking first-seen (P8, G-14), bot por template cifrado (P9, G-10). Cada todo que diverja del spec cita `mega-refactor-tramos.md:118-126`.
- Onda de verificación P2 con sub-agentes por punto P3–P9 antes de implementar.
- DDL recalculado 17 tablas efectivas (22 del spec − `kols`, `kol_channels`, `kol_reputation`, `kol_stats`, `classified_calls`; 18 si tracking separado cuenta aparte — G-13). Contratos central pinneados (versión fecha+hash).
- Bot lookup: SUPERSEDED por P13 — vive en `apps/dexter-onchain-bot/` (Tramo 3, todo 9), NO en kol-system. kol-system conserva solo bots por template solo-publishing (P12b).
- P14: `vip-calls` absorbido — es NOMBRE de template seed, nunca módulo/código. Cada template publica o no según su bot configurado vía frontend.
- P18: cada move-todo depreca su contraparte backend acto seguido (companion Nb); borrado solo en todo 16.
- P21: cada move-todo registra health indicator (`ingestion.sse`, `database`, `redis`, +1 por módulo); shared/ se REUTILIZA siempre (extender, nunca copiar/duplicar).
- P25: `apps/kol-system/AGENTS.md` vivo — creado en todo 21, actualizado al cierre de cada todo.
- P28: scoring 100% configurable por template (`scoring_config`; follow-up todo 22).
- Dual-run sem 2-8 + shadow/dry-run + staging 14 días + rollback rehearsal + cutover por flags + cleanup (archivar, NO dropear).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO deduplicación propia de ninguna índole; NO colapsar menciones en normalization/parsing.
- NO construir BC `kol-identity` (solo DTO + HTTP client a `/feed/sources?type=kol`) ni BC `classification` (solo config por-template).
- NO crear `/api/feed/kols` ni `/kol-messages` (usar `?type=kol` hasta decisión central G-05).
- NO mover providers físicos (C-DATA-01: extracción física es Tramo 3) ni tocar `telegram/shared` fuera del movimiento KOL-bot (C-SHARED-01/C2).
- NO MTProto fuera de ingestion-telegram. NO threads implementados (stub 501 + test).
- NO cutover sin Gate T1 del plan central (staging 14d + shadow + rehearsal + E2E>200 + load 100/h×24h).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (unit) + e2e `*.e2e-spec.ts` + Playwright (dashboard) — la app es nueva, cada módulo sale con su suite; legacy stay-green obligatorio.
- Evidence: .omo/evidence/task-<N>-mega-refactor-kol-system.<ext>

## Execution strategy

### Parallel execution waves

> Wave 1: todos 1-3 (setup+shared+verificación). Wave 2: todos 4-8 (pipeline). Wave 3: todos 9-12 (scoring→tracking). Wave 4: todos 13-16 (avatar+frontend+staging+cutover). 3-5 todos por wave.

### Dependency matrix

| Todo                                 | Depends on                                      | Blocks                                     | Can parallelize with                                   |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| 1 (P2 verify)                        | central 1,5                                     | 4-14 (aclara contratos antes de codificar) | 2, 3                                                   |
| 2 (setup), 3 (shared)                | central 2,3                                     | 4-12, 19                                   | 1                                                      |
| 19 (config sin KOL_BOT_TOKEN)        | 3                                               | 10, 11                                     | —                                                      |
| 4-8 (pipeline)                       | 1, 2, 3                                         | 9-12                                       | entre sí NO (orden de flujo), sí con 13a (avatar spec) |
| 18 (deprecación ingestión backend)   | 4 verificado                                    | 5                                          | —                                                      |
| 9-12 (templates→tracking)            | 4-8                                             | 14, 15                                     | 9∥10 parcial (approval tras templates domain)          |
| 13 (avatar)                          | 1, 4                                            | 14                                         | con nada (requiere ingestion + P2)                     |
| 14 (frontend)                        | 4, 12, 13                                       | 15                                         | —                                                      |
| 17 (lookup — SUPERSEDED P13, inerte) | —                                               | —                                          | — (sin wave)                                           |
| 15, 16 (staging+cutover)             | todos 1-16 (excluye 17 inerte) + central gate 8 | —                                          | —                                                      |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Contrato central pinneado: C-\* v2026-09-24 (central 4b0c643f). Spec base: `.kiro/specs/refactor-kol-system/`; divergencias pivot: `.omo/drafts/mega-refactor-tramos.md:118-126` (P1–P9).

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Onda P2: verificación por sub-agentes P3–P9 (P2)
     What to do / Must NOT do: Fan-out 7 verificaciones read-only (explore/librarian, una por punto P3–P9): P3 tipos kol vs crypto en coordinator; P4 endpoints `?type=kol` + avatar feasibility MTProto; P5 parsing contratos multi-mención; P6 score display actual; P7 latencia market-data real (p95) y forma de `more details+`; P8 `first_seen_at` existente; P9 token-por-constructor en adapters. Consolidar claims con evidencia file:line en `.omo/evidence/task-1-mega-refactor-kol-system.md`. Must NOT implementar nada en este todo.
     Parallelization: Wave 1 | Blocked by: central 1, 5 | Blocks: 4-14
     References: .omo/drafts/mega-refactor-tramos.md:118-126; apps/ingestion-telegram/src/core/application/coordinators/message-persistence.coordinator.ts:98-101 (route por messageType); apps/backend/src/token/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity.ts:84
     Acceptance criteria: `test -f .omo/evidence/task-1-mega-refactor-kol-system.md && grep -c "file:line\|:" .omo/evidence/task-1-mega-refactor-kol-system.md` >= 7 (un veredicto con cita por punto P3–P9)
     QA scenarios: happy 7/7 verificados; failure algún P bloqueado → reportar al central, NO auto-rediseñar. Evidence .omo/evidence/task-1-mega-refactor-kol-system.md
     Commit: N (evidencia) | — | —
- [x] 2. App setup: esqueleto kol-system + health + compose (Ph1 spec)
     What to do / Must NOT do: `apps/kol-system/` con `package.json` (NestJS 11, TypeORM, schedule), `nest-cli.json`, `tsconfig.json`, `src/main.ts` (:3050, ValidationPipe), `src/app.module.ts` (14 imports stub), `.env.example` (`KOL_SYSTEM_ENABLED`, `TEMPLATE_ORCHESTRATOR_ENABLED`, `INGESTION_TELEGRAM_URL`, `KOL_BOT_TOKEN`, `ENCRYPTION_KEY`), `Dockerfile`, `docker-compose.yml` (DB `alpha_meta_token_scanner_kol_system` + redis), `GET /api/health`. Must NOT lógica de negocio.
     Parallelization: Wave 1 | Blocked by: central 2, 3 | Blocks: 3-12
     References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:24-63; .omo/reference/mega-refactor-target-tree.md (bloque kol-system raíz)
     Acceptance criteria: `curl -s localhost:3050/api/health | grep -q '"status":"ok"'`
     QA scenarios: happy health 200; failure puerto ocupado → `lsof -i :3050` y fallback según C-PORTS-01. Evidence .omo/evidence/task-2-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): app setup con health y compose
- [x] 3. Shared kernel + config + guards (Ph2 spec)
     What to do / Must NOT do: `src/shared/kernel/{aggregate-root.ts,entity.ts,value-object.ts,domain-event.ts}`, `config/{app,database,redis,telegram}.config.ts` (registerAs + validación Tier-1 no-vacía), `ApiKeyGuard`, `DomainExceptionFilter`, `shared.module.ts`. Tests unitarios por componente. Must NOT importar TypeORM/axios en `domain/`.
     Parallelization: Wave 1 | Blocked by: 2 | Blocks: 4-12
     References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:65-87; apps/backend/src/shared/kernel/aggregate-root.ts:17 (patrón)
     Acceptance criteria: `npx jest apps/kol-system/src/shared --coverage` sin fallos; `grep -r "from 'typeorm'\|from 'axios'" apps/kol-system/src/shared/kernel apps/kol-system/src/shared/domain` vacío
     QA scenarios: happy suite verde; failure import externo en domain → mover a infrastructure. Evidence .omo/evidence/task-3-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): shared kernel y config
- [x] 4. Ingestion kol-type por HTTP+SSE (Ph3 spec + P3)
     What to do / Must NOT do: `KolIngestionClient` (`GET /api/feed/sources?type=kol`, `GET /api/feed/messages`), SSE listener suscrito a `/api/ingestion/stream` filtrando `messageType==='kol'` client-side (P10: `'crypto-news'` prohibido aquí), `ProcessKolMessageHandler`, P20 SSE-ONLY sin polling (al reconectar, catch-up por cursor desde último messageId, NO cron), backoff 1s→30s. Tests: doble-delivery realtime+catch-up → 1 row. Must NOT crear endpoints nuevos en ingestion ni filtrar server-side.
     Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 5-8
     References: .kiro/specs/refactor-kol-system/overview.md:176-207; plan central C-SSE-01; apps/backend/src/telegram/ingestion/shared/api/sse/ (patrón backoff cliente)
     Acceptance criteria: `curl -s 'localhost:3031/api/feed/sources?type=kol' | jq length` >= 0; test doble-delivery verde; `grep -ri "crypto-news" apps/kol-system/src/ingestion` vacío (assert negativo P10)
     QA scenarios: happy mensaje kol ingerido <10s vía SSE; failure SSE caído → polling 1min lo repesca (test con stream mock caído). Evidence .omo/evidence/task-4-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): ingestion kol-type HTTP+SSE
- [x] 18. Deprecar ingestión KOL backend (P18, companion del 4)
      What to do / Must NOT do: Tras verificar el todo 4, marcar `@deprecated` (headers + JSDoc con puntero `apps/kol-system/src/ingestion/`) en la contraparte backend (`apps/backend/src/telegram/ingestion/kol/` o equivalente real que el worker resuelva con lsp_find_references; si no existe contraparte directa, deprecation header en el consumer más cercano). El código backend sigue funcionando (dual-run). Tests legacy verdes. Must NOT borrar nada ni cambiar comportamiento.
      Parallelization: Wave 2 | Blocked by: 4 verificado | Blocks: 5
      References: .omo/drafts/mega-refactor-tramos.md (P18); scripts/add-deprecation-headers.js (patrón, si aplica)
      Acceptance criteria: `grep -r "@deprecated" apps/backend/src/telegram/ingestion/kol/ | wc -l` >= 1 (o header en consumer documentado en evidencia) + `npm run test:backend -- telegram/ingestion` verde
      QA scenarios: happy headers presentes y suite verde; failure sin contraparte → documentar dónde y por qué en evidencia, NO inventar. Evidence .omo/evidence/task-4b-mega-refactor-kol-system.log
      Commit: Y | chore(kol-system): depreca ingestión KOL backend (apunta a apps/kol-system)
- [x] 5. Extraction contrato×mención sin colapso (Ph4 spec + P5)
     What to do / Must NOT do: `ExtractFromMessageUseCase` directo (fix-1, sin event bus); por cada mención guarda contrato + timestamp + handle + url + channel info + db-id (`ExtractionCandidate`); multi-tip NO colapsa (override explícito del spec overview:64); repeats válidas. P26: cada extracción EMITE snapshot base (mención + 4 fechas: `occurredAt`→`occurred_at_telegram`, `ingested_at_kol`=now, `enriched_at` lo pone enrichment) hacia enrichment. Tests: 1 mensaje × 3 menciones → 3 filas + 3 snapshots base.
     Parallelization: Wave 2 | Blocked by: 4, 18 | Blocks: 6
     References: .omo/drafts/mega-refactor-tramos.md:122 (P5); .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:108-129; apps/backend/src/token/intake/extraction/ (origen a mover: extract-from-message.use-case.ts)
     Acceptance criteria: `psql -c "SELECT count(*) FROM extraction_candidates WHERE message_id='X'"` = 3 para fixture triple-mención
     QA scenarios: happy 3 filas; failure texto sin contrato → 0 filas, sin excepción. Evidence .omo/evidence/task-5-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): extraction por mención
- [x] 6. Parsing a ficha estructurada preservando menciones (Ph5 spec + P5)
     What to do / Must NOT do: `ParseFromCandidatesUseCase` → `ParsedCall` (ticker, address, chain, kol ref); preserva 1:1 con candidatos (NO collapse-to-one). Tests property: nº parsed == nº candidates para fixture.
     Parallelization: Wave 2 | Blocked by: 5 | Blocks: 7
     References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:130-151; apps/backend/src/token/intake/parsing/ (origen: parse-from-candidates.use-case.ts)
     Acceptance criteria: `npx jest apps/kol-system/src/parsing` verde + invariante 1:1 en test
     QA scenarios: happy parse completo; failure ilegible → descartado con log, pipeline sigue. Evidence .omo/evidence/task-6-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): parsing preservando menciones
- [x] 7. Normalization como índice de menciones (Ph6 spec + G-12)
     What to do / Must NOT do: `NormalizeCallUseCase` → índice `(contract, kol, messageId)` SIN colapso ("one card per coin" del spec queda EXPLÍCITAMENTE derogado); tabla menciones separada de canonical; `normalization.call.normalized` por mención. Tests: mismo contrato × 2 kols × 2 mensajes → 4 filas normalizadas.
     Parallelization: Wave 2 | Blocked by: 6 | Blocks: 8
     References: .omo/drafts/mega-refactor-tramos.md:118 (P1); .kiro/specs/refactor-kol-system/overview.md:100,1100 (derogado: merge duplicates)
     Acceptance criteria: `psql -c "SELECT count(*) FROM normalized_mentions"` = 4 para fixture; 0 llamadas a merge/collapse en `src/normalization`
     QA scenarios: happy 4 filas; failure duplicado realtime+polling → 1 fila (solo anti-doble-delivery). Evidence .omo/evidence/task-7-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): normalization como índice de menciones
- [x] 8. Enrichment vía MarketDataPort dual (Ph7 spec + C-DATA-01 + G-17)
     What to do / Must NOT do: `EnrichmentOrchestratorService` contra `MarketDataPort` con DOS implementaciones: `local-cascade` (default, reutiliza lógica backend vía ports) y `http-market-data` (stub tras `USE_DATA_SERVICE_API=true`, timeout + SLO p95<500ms); `mc at` = snapshot al capturar (retraso documentado ≤30s, C-A). P26: enrichment completa snapshot en tabla `mention_snapshots` (P27: entidad propiedad del módulo `src/snapshot/`, MISMA DB kol-system; enrichment escribe vía port) (`occurred_at_telegram`, `ingested_at_kol`, `enriched_at`=`snapshot_at`, + market data) y lo envía al frontend. Tests con MockPort + test 4 fechas presentes por snapshot. Must NOT mover providers físicos ni llamar market-data en Tramo 1 (flag default false).
     Parallelization: Wave 2 | Blocked by: 7 | Blocks: 9
     References: .omo/drafts/mega-refactor-tramos.md:125 (P7); .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:173-195; apps/backend/src/token/enrichment/application/handlers/enrich-token.use-case.ts (cascada origen)
     Acceptance criteria: `USE_DATA_SERVICE_API=false npx jest apps/kol-system/src/enrichment` verde; con `=true` usa HTTP (test con mock server)
     QA scenarios: happy enrich con `mc at` persistido; failure provider caído → null + siguiente en cascada (silent null). Evidence .omo/evidence/task-8-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): enrichment dual-port con mc-at
- [x] 9. Scoring + classification-config por template (Ph8 spec + P6 + G-08)
     What to do / Must NOT do: `ScoreTokenUseCase` (base 50, tiers, 8 fail-fast gates) + `ScoredCall`; classification COMO CONFIG por-template (canales visibles, score display, filtros gemas: threshold score + regex sobre enrichment) — SIN tabla `classified_calls`, SIN BC standalone; flujo `enrichment→scoring→templates`. Tests gates + ejemplo filtro gema.
     Parallelization: Wave 3 | Blocked by: 8 | Blocks: 10
     References: .omo/drafts/mega-refactor-tramos.md:124 (P6); .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:196-220; apps/backend AGENTS §SCORING & GATES (8 gates)
     Acceptance criteria: `grep -r "classified_calls" apps/kol-system/src` vacío; suite scoring verde
     QA scenarios: happy score + ranking; failure bajo-corte → descartado pre-publisher. Evidence .omo/evidence/task-9-mega-refactor-kol-system.log
     Commit: Y | feat(kol-system): scoring y classification por-template
- [x] 10. Templates CORE sin threads + bot-token cifrado (Ph9 spec + C1 + G-10 + G-11 + P9)
      What to do / Must NOT do: `PublishingTemplate` + `TemplateOrchestratorService` (cron 1min) + `RankingEngine` (4 estrategias) + CRUD (`Create/Update/Activate/GetRankings`) + `TemplatesController` (11 endpoints); `threadConfig: null` + endpoints `.../threads/*` → 501 + test que fija el stub; tabla `telegram_bots` (id, token cifrado AES-256-GCM vía `EncryptionService` + `ENCRYPTION_KEY`, label; reutilizable: mismo bot en varios canales/templates) + template con `bot_id` + `channel_target` (sin `bot_id` = solo dashboard) + CRUD frontend (`GET/POST/PATCH /api/templates/:id/bots`, redact `'***'` en GET) + verificación admin al asignar canal (`getChatMember` → administrator/creator, guarda `admin_verified_at`; publicar exige canal verificado) + migración + round-trip test; P22/P23: config Telegram 100% DB, CERO env `KOL_BOT_TOKEN` (todo 19 lo retira de setup+validación). P15 SUPERSEDED por P16: sin tabla `template_dashboards`. El template guarda `kolSourceIds: string[]` (vacío = todas las sources) + endpoint `PATCH /api/templates/:id/sources` validando channelIds contra `GET /api/feed/sources?type=kol`; seed `vip-calls` con selección vacía (todas). Must NOT threads implementados ni token en plano.
      Parallelization: Wave 3 | Blocked by: 9 | Blocks: 11
      References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:221-313; .kiro/specs/refactor-kol-system/overview.md:1263 (publishing_config JSONB),938 (redact); .omo/drafts/mega-refactor-tramos.md:126 (P9),111 (C1)
      Acceptance criteria: `curl -s -o /dev/null -w "%{http_code}" localhost:3050/api/templates/x/threads` = 501; `psql -c "SELECT token FROM template_bot_tokens"` ilegible sin key; `GET` redacta
      QA scenarios: happy CRUD + orchestrate; failure token ausente → publishing deshabilitado para ese template, resto sigue. Evidence .omo/evidence/task-10-mega-refactor-kol-system.log
      Commit: Y | feat(kol-system): templates core con stub threads y bot-token cifrado
- [x] 11. Approval + publishing multi-bot, movimiento KOL-bot (Ph10-11 spec + C2)
      What to do / Must NOT do: `CallApproval` + `EvaluateApproval` + `GetPendingApprovals`; `PublishingJob` + `PublishFromTemplate` + `ManualPublish`; `MultiBotPublisherAdapter` (KOL_BOT_TOKEN); MOVER (lsp_find_references primero) el KOL bot fuera de `backend telegram/shared` — primer movimiento C-SHARED-01; ticker nunca null pre-publisher. P14: seed de template por defecto NOMBRADO `vip-calls` (dato, no módulo); publicar o no lo decide el bot configurado del template. Tests + e2e publish en canal espejo.
      Parallelization: Wave 3 | Blocked by: 10 | Blocks: 15
      References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:315-384; apps/backend/src/telegram/vip-calls/vip-channel/ (origen); apps/backend/src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts:24-52 (token por config)
      Acceptance criteria: `curl -s localhost:3050/api/approvals/pending | jq length` >= 0; e2e espejo publica 1 call
      QA scenarios: happy approve→publish; failure `KOL_BOT_TOKEN` ausente → 401 sin postear nada real. Evidence .omo/evidence/task-11-mega-refactor-kol-system.log
      Commit: Y | feat(kol-system): approval y publishing multi-bot
- [ ] 12. Tracking first-seen + rating +5x (Ph12 spec + P8 + G-14)
      What to do / Must NOT do: Columnas `first_seen_at`, `first_mc_at`, `last_call_mc_at`, `times_called`; job que las mantiene; `tracking` = `First time` vs `Nx from last call`; rating kol por calls +5x con fórmula + ejemplo numérico documentado; endpoint fila tabla. Ranking P11: job cron mantiene `kol_window_stats(caller, window, total_x, calls_count)` (múltiple = `last_mc/first_mc_at`, SUMA por caller + CONTEO de calls; display +NX 30D/7D, +% 1D) + `GET /api/kol-rankings?window=30d|7d|1d&sort=perf_desc|perf_asc|calls_desc` ordenado según sort. P26: el X de performance se calcula contra el ÚLTIMO snapshot de (caller, contrato) (`last_mc/snapshot MC`, ej. +55X). Tests: 2ª mención mismo kol+contrato → `2x from last call` con deltas; ranking con fixture 3 callers suma y conteo correctos por ventana.
      Parallelization: Wave 3 | Blocked by: 11 | Blocks: 14
      References: .omo/drafts/mega-refactor-tramos.md:125 (P8); apps/backend/src/token/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity.ts:84 (first_seen_at existente); .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:385-411
      Acceptance criteria: `psql -c "SELECT tracking FROM tracked_mentions WHERE times_called=2"` = `2x from last call` + `curl -s 'localhost:3050/api/kol-rankings?window=30d' | jq 'length >= 0'`
      QA scenarios: happy primera vs segunda mención + ranking suma correcta por ventana (fixture 3 callers); failure `first_mc_at` null (enrich falló) → tracking muestra `mc n/a`, sin crash. Evidence .omo/evidence/task-12-mega-refactor-kol-system.log
      Commit: Y | feat(kol-system): tracking first-seen y rating
- [ ] 13. Avatar KOL vía ingestion-telegram (P4 + G-09)
      What to do / Must NOT do: Fuente MTProto photo (o Bot API `getUserProfilePhotos`); owner ingestion-telegram (invariante media owner): columna/tabla + serve `GET /api/kol-avatar/:channelId` + `avatarUrl` en proyección `GET /api/feed/sources` + job fetch-ONCE al registrar source (SIN refresh periódico; solo explícito manual) + fallback placeholder. P19: avatares PERMANENTES — EXCLUIDOS del janitor 72h (verificar que el cleanup solo toca messages+media de mensajes); kol-system solo consume URL (rankings + dashboard). Si ingestion necesita cambio, todo separado en su repo con backlink. Tests fallback + test anti-janitor (avatar sobrevive a corrida de retención).
      Parallelization: Wave 4 | Blocked by: 1, 4 | Blocks: 14
      References: .omo/drafts/mega-refactor-tramos.md:121 (P4); apps/ingestion-telegram (media owner: `uploads/crypto-news/media/` + `GET /api/media/*`)
      Acceptance criteria: `CH=$(curl -s 'localhost:3031/api/feed/sources?type=kol' | jq -r '.[0].channelId // empty') && test -n "$CH" && curl -s -o /dev/null -w "%{http_code}" "localhost:3031/api/kol-avatar/$CH" | grep -q "200"`; sin foto → placeholder 200 (mismo comando contra channel sin foto documentado en evidencia)
      QA scenarios: happy avatar servido; failure fetch MTProto falla → placeholder + retry diferido. Evidence .omo/evidence/task-13-mega-refactor-kol-system.log
      Commit: Y | feat(kol-system): avatar KOL con fallback (2 commits si toca ingestion)
- [ ] 14. Frontend: tabla caller|call|mc at|tracking|time ago|more details+ (P5/P8 + C-UX-01)
      What to do / Must NOT do: Vista por template (canales P6) con columnas exactas; `more details+` expande enrichment completo; avatar + handle + url + db-id en caller; polling 5-30s (TanStack) como resto del dashboard. P16: dashboard ÚNICO con multi-select de KOL sources (alimentado de ingestion-telegram) que filtra calls/ranking/gems/tracking del template. P17 layout: ranking performance horizontal 10 (5 izq + 5 der) con flechas mayor↔menor; tira horizontal top-10 callers por nº calls con selector 30D/7D/1D; sección extendida de configuración del template (sources, score display, filtros gemas, bot). Must NOT romper dashboard legacy (convive hasta cutover).
      Parallelization: Wave 4 | Blocked by: 12, 13 | Blocks: 15
      References: plan central C-UX-01 sub-tabla Tramo 1; apps/frontend/src/shared/api/endpoints.ts (prefijos vip-calls/kols); .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md (dashboard production-ready gate)
      Acceptance criteria: `npx playwright test -g "kol calls table"` verde con ≥1 fila `First time` y ≥1 `Nx from last call` + `npx playwright test -g "kol rankings table"` verde con ≥1 fila por ventana (30d/7d/1d) + `npx playwright test -g "template sources filter"` verde (elegir 2 sources, tabla muestra solo sus calls; limpiar = todas) + `npx playwright test -g "dashboard layout"` verde (ranking 5+5 con flechas que invierten orden; top-10 callers con selector 30D/7D/1D cambiando conteos)
      QA scenarios: happy tabla + expand + ranking con selector de ventana; failure API caída → empty-state, sin crash. Evidence .omo/evidence/task-14-mega-refactor-kol-system.log + captura
      Commit: Y | feat(frontend): tabla calls por template
- [ ] 15. Dual-run + shadow + staging 14d + rollback rehearsal (C3 + G-19)
      What to do / Must NOT do: Sem 2-8 `KOL_PIPELINE_ENABLED=true` + `KOL_SYSTEM_ENABLED=true` comparando outputs side-by-side (logs + published); shadow/dry-run en canal espejo; staging 14 días; rehearsal rollback completo (re-enable backend + orchestrator off <30min) con tiempo medido. Suites legacy green: `npm run test:backend -- kol telegram token`, `test:ingestion`, `test:frontend`. Must NOT saltar staging ni rehearsal.
      Parallelization: Wave 4 | Blocked by: 11, 14 | Blocks: 16
      References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:639-693; plan central Gate T1
      Acceptance criteria: `grep -q "staging-days: 14" /tmp/qa-tramo1.log && grep -q "rehearsal-min: " /tmp/qa-tramo1.log && grep -q "legacy-suites: green" /tmp/qa-tramo1.log` (el worker escribe esas 3 líneas con valores medidos: días efectivos, minutos rehearsal, resultado suites) + `curl -s localhost:3051/api/health | jq -e '.components | has("ingestion"), has("database"), has("templates"), has("publishing")'` (P21: todos los componentes en el health)
      QA scenarios: happy side-by-side sin divergencias >umbral; failure divergencia → investigar, NO cutover. Evidence /tmp/qa-tramo1.log + .omo/evidence/task-15-mega-refactor-kol-system.log
      Commit: N (evidencia) | — | —
- [ ] 16. Cutover + cleanup Tramo 1 (Ph cutover spec)
      What to do / Must NOT do: Staging 48h (`KOL_PIPELINE_ENABLED=false`, `KOL_SYSTEM_ENABLED=true`) → prod Blue/Green (deploy inactivo, health, `TEMPLATE_ORCHESTRATOR_ENABLED=true`, observar 30min+2h, disable backend) → tras 7 días OK: `rm -rf` kol backend (`kol/`, `ingestion/kol/`, `vip-calls/`), archivar tablas a `_archived` (NO DROP), deprecation headers resto. Rollback <30min listo.
      Parallelization: Wave 4 | Blocked by: 15 | Blocks: Tramo 2 (precondition)
      References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:658-714; plan central Gate T1
      Acceptance criteria: `curl -s localhost:3030/api/vip-calls/calls/recent?limit=5` sigue respondiendo vía kol-system; `psql -c "\dn"` muestra `_archived`
      QA scenarios: happy cutover sin gap >1 cron; failure post-cutover → rollback ejecutado y medido. Evidence .omo/evidence/task-16-mega-refactor-kol-system.log
      Commit: Y | feat(kol-system)!: cutover y cleanup backend KOL (breaking scope)
- [ ] 17. SUPERSEDED por P13 — NO ejecutar. Contenido movido a Tramo 3 todo 9 (`apps/dexter-onchain-bot/`).
      What to do / Must NOT do: Saltar este todo. Must NOT implementar lookup en kol-system.
      Parallelization: — | Blocked by: — | Blocks: —
      References: .omo/drafts/mega-refactor-tramos.md (P13); .omo/plans/mega-refactor-market-data.md todo 9
      Acceptance criteria: `ls apps/kol-system/src | grep -i lookup` vacío
      QA scenarios: —. Evidence —
      Commit: N | — | —
- [x] 19. Retirar KOL_BOT_TOKEN de setup+validación (P23)
      What to do / Must NOT do: Quitar `KOL_BOT_TOKEN` de `.env.example` y de la validación Tier-1 (`validateKolSystemConfig` ya NO lo exige; app arranca sin bot configurado = modo solo-dashboard); `MultiBotPublisherAdapter` resuelve token desde catálogo `telegram_bots` por `template.bot_id` (NO env). Tests: boot sin token verde; validación exige `ENCRYPTION_KEY`+`DATABASE_URL` pero no bot. Must NOT dejar referencias a `process.env.KOL_BOT_TOKEN`.
      Parallelization: Wave 1 | Blocked by: 3 | Blocks: 10, 11
      References: .omo/drafts/mega-refactor-tramos.md (P23); apps/kol-system/.env.example; apps/kol-system/src/shared/config/app.config.ts (validateKolSystemConfig)
      Acceptance criteria: `grep -rn "KOL_BOT_TOKEN" apps/kol-system --include="*.ts" | grep -v spec | wc -l` = 0 + `npx jest apps/kol-system/src/shared` verde
      QA scenarios: happy boot sin bot (dashboard-only); failure `ENCRYPTION_KEY` ausente → error claro. Evidence .omo/evidence/task-19-mega-refactor-kol-system.log
      Commit: Y | refactor(kol-system): config Telegram 100% DB sin KOL_BOT_TOKEN
- [x] 20. Templates env multi-entorno + scp a Oracle (P24)
      What to do / Must NOT do: Crear `apps/kol-system/.env.development` (valores dummy dev), `.env.staging.template` y `.env.production.template` (placeholders `ENCRYPTION_KEY=`, `DATABASE_URL=`, `REDIS_URL=`, `INGESTION_TELEGRAM_URL` por env, SIN secretos); documentar en el template el `scp .env.staging/.env.production OracleDroplet:/opt/...` de despliegue (rutas según C-CI-01); verificar `.gitignore` cubre `.env.staging` y `.env.production` (NO `.env.*.template`); test: validación arranca con cada template + placeholders sustituidos (sin secretos reales). Must NOT commitear secretos ni rutas inventadas (las de Oracle las confirma el worker contra `docker-compose.*.yml` existentes).
      Parallelization: Wave 1 | Blocked by: 19 | Blocks: 10, 11 (bots necesitan key por env)
      References: .omo/drafts/mega-refactor-tramos.md (P24); apps/backend/.env.staging.template + .env.production.template (patrón espejo); .gitignore (`.env*` excepto example/template)
      Acceptance criteria: `git check-ignore apps/kol-system/.env.staging && git check-ignore apps/kol-system/.env.production && echo IGNORED-OK`; `git ls-files apps/kol-system/.env*` lista solo development + 2 templates
      QA scenarios: happy boot con cada template (valores dummy); failure secreto commiteado → pre-commit lo cazaría (verificar con `git log --all -S 'sk-' --oneline -- apps/kol-system | wc -l` = 0). Evidence .omo/evidence/task-20-mega-refactor-kol-system.log
      Commit: Y | chore(kol-system): templates env multi-entorno (P24)
- [x] 21. AGENTS.md vivo de kol-system (P25)
      What to do / Must NOT do: Crear `apps/kol-system/AGENTS.md` espejo de `apps/backend/AGENTS.md` en estructura (overview, comandos, envs, puertos, convenciones TS/ESLint, tests, decisiones P1–P24 aplicables con fecha) adaptado a kol-system; registrar REGLA standing: cada todo futuro cierra con paso "actualiza AGENTS.md si cambió algo (comandos, envs, puertos, decisiones)". Verificar enlaces a ficheros reales (0 links rotos). Must NOT copiar secciones backend que no apliquen (MTProto, providers).
      Parallelization: Wave 1 | Blocked by: 3 | Blocks: — (standing rule para 4+)
      References: .omo/drafts/mega-refactor-tramos.md (P25, P1–P24); apps/backend/AGENTS.md (estructura espejo); apps/ingestion-telegram/AGENTS.md (brevedad espejo)
      Acceptance criteria: `test -f apps/kol-system/AGENTS.md && grep -c "P1[0-9]" apps/kol-system/AGENTS.md` >= 5 (decisiones pivot citadas)
      QA scenarios: happy todo futuro lo actualiza (verificar en reviews); failure link roto → `grep -o "\[.*\](.*)" AGENTS.md` y comprobar destinos. Evidence .omo/evidence/task-21-mega-refactor-kol-system.log
      Commit: Y | docs(kol-system): AGENTS.md vivo con regla de actualización
- [ ] 22. Scoring configurable por template (P28, follow-up del 9)
  What to do / Must NOT do: Añadir `scoring_config` al modelo PublishingTemplate (pesos, bonus, penalties, tier thresholds, gate thresholds: min score, caps; defaults = v1 actual del todo 9); ScoreTokenUseCase lee la config del template de la mención (fallback a defaults si ausente); endpoint/UI edita `scoring_config` con validación (rangos); tests: mismo input con 2 configs distintas → scores distintos + defaults intactos cuando no hay config. Must NOT romper el default v1 (compatibilidad).
  Parallelization: Wave 3 | Blocked by: 9, 10 (modelo template) | Blocks: 15 (staging lo valida)
  References: .omo/drafts/mega-refactor-tramos.md (P28); apps/kol-system/src/scoring/ (fórmula v1 como defaults); apps/kol-system/src/templates/ (modelo a extender)
  Acceptance criteria: `npx jest src/scoring src/templates` verde con test de 2-configs-distinto-score
  QA scenarios: happy config custom cambia score; failure config inválida → 400 con mensaje, defaults intactos. Evidence .omo/evidence/task-22-mega-refactor-kol-system.log
  Commit: Y | feat(kol-system): scoring configurable por template

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Un commit por todo (feat(kol-system): …), salvo evidencia (N). Cutover con `!` (breaking scope). Push a `feat/mega-refactor-tramos`; PRs a `dev` solo al cerrar gates.

## Success criteria

- `apps/kol-system/` en prod publicando VIP calls con `KOL_PIPELINE_ENABLED=false`.
- Backend sin `kol/`, `ingestion/kol/`, `vip-calls/`; tablas archivadas en `_archived`.
- Dashboard por template con tabla first-seen; staging 14d + rehearsal <30min en evidencia.
