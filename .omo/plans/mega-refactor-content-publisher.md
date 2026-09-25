# mega-refactor-feed-publisher - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una app nueva `feed-publisher` con todo feed fuera del monolito: matching, queue unificada, LLM, ads y adapters propios, con rollback de 30 minutos.

**Why this approach:** Va segundo, cuando el patrón de extracción ya está validado por el Tramo 1, y ejecuta el segundo movimiento del split `telegram/shared` (crypto-adapters) sin pisar al Tramo 1.

**What it will NOT do:** No toca KOL-bot ni providers, no implementa threads (esqueleto + contrato v2), no redefine contratos.

**Effort:** Large (12 todos, 7 semanas)
**Risk:** Medium - spec maduro + rollback rápido
**Decisions I made for you:** Precondition Gate T1 con checklist; embeddings en tabla (no pgvector); gateway LLM multi-provider; uploads en raíz de app.

Your next move: approve — listo para $start-work Tramo 2 tras Gate T1. Full execution detail follows below.

---

> TL;DR (machine): Large effort, Medium risk, feed-publisher 11 módulos + cutover 30min

## Scope

### Must have

- Nueva app `apps/feed-publisher/` (:3040/3041/3042) con 11 módulos: ingestion, matching, keywords, filters, queue (unificado `contentType`), deduplication, llm, scheduling (ads), threads (ESQUELETO v1 + contrato de des-stubbeo para kol C1), telegram (crypto+threads, segundo movimiento C-SHARED-01/C2), shared. Spec base `.kiro/specs/refactor-feed-publisher/11-refactor.md` (3437 líneas reales).
- Precondition C4-bis: Gate T1 (deprecation-check + green suites, NO reloj staging) + checklist `telegram/shared` ya movido (KOL-bot fuera) — solo extrae crypto-adapters (G-15).
- `EnrichmentPort` dual igual que Tramo 1 (local default, HTTP tras flag; G-17). Dual-path SSE+polling, 3-flag control, rollback 30min, deprecation 5 fases post-cutover.
- Staging 7 días validación (C4-bis, no-bloqueante para T3) + rollback rehearsal + cutover `USE_FEED_PUBLISHER` + deprecate-only backend feed (borrado solo en FINAL REVIEW central).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO tocar KOL-bot ni `telegram/shared` más allá de crypto-adapters. NO threads implementados (esqueleto + contrato).
- NO redefinir contratos C-\* (solo referenciar versión pinneada). NO cutover sin Gate T2.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest + e2e + Playwright (4 endpoints críticos frontend).
- Evidence: .omo/evidence/task-<N>-mega-refactor-feed-publisher.<ext>

## Execution strategy

### Parallel execution waves

> Wave 1: setup+shared. Wave 2: ingestion→queue. Wave 3: llm+scheduling+telegram+threads-esqueleto. Wave 4: frontend+staging/cutover/cleanup. Precondition wave 0: checklist Tramo 1.

### Dependency matrix

| Todo                                  | Depends on          | Blocks            | Can parallelize with |
| ------------------------------------- | ------------------- | ----------------- | -------------------- |
| 0 (precondition T1)                   | central gate T1     | 1-11              | —                    |
| 1 (setup+shared)                      | 0, central 2,3      | 2-8               | —                    |
| 2-4 (ingestion→matching→queue)        | 1 (cadena de flujo) | 5-8               | NO entre sí          |
| 5-8 (llm+scheduling+telegram+threads) | 4                   | 9, 10             | 5 ∥ 6 ∥ 7 ∥ 8        |
| 9, 10, 11 (frontend+staging+cutover)  | 5, 6, 7, 8          | T3 (precondition) | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Contrato central pinneado: C-\* v2026-09-24 (central 4b0c643f) — C-SSE-01, C-FLAGS-01, C-SHARED-01/C2, C-UX-01, C1. Spec base: `.kiro/specs/refactor-feed-publisher/` (11-refactor 3437 líneas, guide 8 fases/7sem, tracker 133 tareas, playbook go/no-go).

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 0. Precondition: Gate T1 C4-bis (deprecation-check + green) + checklist telegram/shared (G-15)
     What to do / Must NOT do: Verificar Gate T1 C4-bis: (a) deprecation-check T1 — todo el legacy KOL (`kol/`, `ingestion/kol/`, `vip-calls/`) con `@deprecated` + JSDoc (nueva ruta + refactor target); (b) suites T1 en verde en evidencia; staging 48h es validación y NO se exige completa para arrancar (C4-bis.4). Listar archivos `backend telegram/shared` ya movidos por T1 (KOL-bot fuera); confirmar `KOL_BOT_TOKEN` sin referencias en `telegram/shared` restante. Must NOT arrancar sin deprecation-check + green T1.
     Parallelization: Wave 0 | Blocked by: central gate T1 (deprecation-check + green) | Blocks: 1-11
     References: plan central Gate T1 C4-bis + FINAL REVIEW; .omo/drafts/mega-refactor-tramos.md §10 (C4-bis), :110,130 (C2); .kiro/specs/refactor-kol-system/overview.md:1373-1495 (6 renombres kol→threads)
     Acceptance criteria: `grep -r "@deprecated" apps/backend/src/kol apps/backend/src/telegram/vip-calls 2>/dev/null | wc -l` >= 1 por concepto + suites T1 verdes en evidencia + `grep -r "KOL_BOT_TOKEN\|kol-bot" apps/backend/src/telegram/shared` vacío
     QA scenarios: happy deprecation-check + green + checklist verde; failure resto KOL en shared sin deprecar → devolver a T1, NO pisar. Evidence .omo/evidence/task-0-mega-refactor-feed-publisher.log
     Commit: N | — | —
- [x] 1. App setup 11 módulos + shared transversal (Ph1-2 guide)
     What to do / Must NOT do: `apps/feed-publisher/` (`package.json` NestJS11/TypeORM/Bull/OpenAI/BotAPI, nest-cli, tsconfig, `src/main.ts` :3040 dev / :3041 staging / :3042 prod, `app.module.ts` 11 imports, `.env.example` 25 vars, compose dev, `/api/health`) + `src/shared/` completo (VOs, eventos, excepciones, typeorm base+`naming-strategy`, http+retry, cache, messaging, monitoring Pino/Prometheus, security, decorators, filters, config, `ApiKeyGuard`). Tests >80% shared. Must NOT negocio aún. P30 (lecciones T1): Dockerfile CMD `dist/main.js`; alias `npm run dev`; `INGESTION_TELEGRAM_API_KEY` en `.env.example` desde el día 1; env templates staging+prod + DBs `onchain_bot_*`; lockfile sincronizado; AGENTS.md vivo.
     Parallelization: Wave 1 | Blocked by: 0 | Blocks: 2-8
     References: .kiro/specs/refactor-feed-publisher/IMPLEMENTATION-GUIDE.md:24-79; 11-refactor.md:964-1051+ (shared); .omo/reference/mega-refactor-target-tree.md (bloque feed-publisher shared)
     Acceptance criteria: `curl -s localhost:3040/api/health | grep -q '"status":"ok"'` + shared coverage >80%
     QA scenarios: happy boot + suite; failure puerto ocupado → C-PORTS-01. Evidence .omo/evidence/task-1-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): setup y shared transversal
- [x] 2. Ingestion feed por HTTP+SSE (11-refactor §1)
     What to do / Must NOT do: `FeedIngestionClient` + `ProcessFeedMessageHandler` movidos desde `crypto-news-integration/`; SSE listener con filtro `messageType==='crypto-news'` (C-SSE-01) — P10: suscribirse a `'kol'` está PROHIBIDO en esta app; polling fallback. P30: `x-api-key` (`INGESTION_TELEGRAM_API_KEY`) en SSE + feed reads desde el día 1 (staging ingestion la exige); catch-up por cursor como kol-system (P20 espejo). Tests doble-delivery → 1 row. Must NOT métodos KOL (ya en kol-system; si existen, borrar).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
     References: 11-refactor.md:86-137; apps/backend/src/telegram/crypto-news-integration/ (origen); plan central C-SSE-01
     Acceptance criteria: `curl -s 'localhost:3031/api/feed/messages?limit=1'` 200 + test doble-delivery verde
     QA scenarios: happy ingesta <10s SSE; failure SSE caído → polling repesca. Evidence .omo/evidence/task-2-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): ingestion feed
- [x] 3. Matching + keywords + filters (11-refactor §§2-4)
     What to do / Must NOT do: Mover `FilteredFeedService`, `EnqueueMatchingCronScheduler`, `MatchingConfig`; `Keyword`/`BlacklistPhrase` + evaluators; `compound/` nuevo; `ContentFilterService` (ReDoS-safe) desde `ingestion/feed/`; FK-less (recomendación spec). Tests OR/blacklist/AND-groups + 41 renombres tabla guide. Must NOT threads en matching (directo a queue).
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 4
     References: 11-refactor.md:140-371; IMPLEMENTATION-GUIDE tabla 41 renombres; apps/backend/src/telegram/feed-integration + feed-publisher (origen keywords)
     Acceptance criteria: `npx jest apps/feed-publisher/src/matching apps/feed-publisher/src/keywords apps/feed-publisher/src/filters` verde
     QA scenarios: happy match/blacklist/compound; failure regex catastrófico → timeout + log, sin colgar cron. Evidence .omo/evidence/task-3-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): matching, keywords y filters
- [x] 4. Queue unificada + deduplication (11-refactor §§5-6)
     What to do / Must NOT do: `PublisherQueueEntry` + `EnqueueMatchingMessage` + `ProcessNextQueuedArticle` (core) + schedulers (1min + TTL 24h) con discriminator `contentType`; `DeduplicationService` cascada exact→content→semantic (fail-open) + embeddings (decisión storage: pgvector vs tabla — default tabla, a veto). Tests state machine + cascada.
     Parallelization: Wave 2 | Blocked by: 3 | Blocks: 5, 6
     References: 11-refactor.md:373-534; apps/backend/src/telegram/crypto-news-publisher/ (origen); apps/backend/src/shared/deduplication/ (origen)
     Acceptance criteria: `curl -s localhost:3040/api/queue/stats | jq .pending` >= 0 + cascada verde
     QA scenarios: happy enqueue→drain; failure embeddings caídos → fail-open (enqueue igual). Evidence .omo/evidence/task-4-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): queue unificada y dedup
- [x] 5. LLM config+templates+core+playground (11-refactor §7)
     What to do / Must NOT do: `LlmConfig` (3-flag: matching/llm/publishing, `LLM = llm AND publishing`), `PromptTemplate` por content-type, `LlmGenerator` (gateway multi-provider, default) + `MockLlm` (`USE_MOCK_AI`), `Playground` preview sin side-effects, 3 controllers. Tests generación + validación non-Latin.
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 10
     References: 11-refactor.md:537-661; apps/backend/src/telegram/crypto-news-publisher/ (FeedLlmAdapter origen); plan central C-FLAGS-01
     Acceptance criteria: `curl -s -X POST localhost:3040/llm/playground/preview -d '{}'` 200 (mock) sin persistir nada (`psql` queue count igual)
     QA scenarios: happy generate+publish; failure gateway caído tras `llmMaxAttempts=3` → FAILED con retry vía cron. Evidence .omo/evidence/task-5-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): módulo LLM completo
- [x] 6. Scheduling/ads + media library (11-refactor §8)
     What to do / Must NOT do: Mover `feed-ads/` → `scheduling/` (core rotación + media), uploads → `apps/feed-publisher/uploads/ads-library/` (Opción B), renombre módulo, `ads-cron` 1min, 3 controllers. Solo feed (threads sin ads v1). Tests rotación ponderada.
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 10
     References: 11-refactor.md:665-791; apps/backend/src/telegram/crypto-news-ads/ (origen)
     Acceptance criteria: `ls apps/feed-publisher/uploads/ads-library | wc -l` > 0 tras migrate-media + `curl -s localhost:3040/api/ads | jq length` >= 0
     QA scenarios: happy ad intercalado cada N posts; failure media ausente → post sin media, sin crash. Evidence .omo/evidence/task-6-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): scheduling y ads library
- [x] 7. Telegram crypto+threads adapters, segundo movimiento C2 (11-refactor §10)
     What to do / Must NOT do: `feed-bot-api.adapter` (mover `BotApiFeedPublisherAdapter`) + `threads-bot-api.adapter` (nuevo, `THREADS_BOT_TOKEN`) + `TelegramPublisherPort`; routing por `contentType`; rate-limit configurable por bot. Verificar (lsp_find_references) que KOL-bot ya está fuera. Tests sendMessage/sendPhoto mock.
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 10
     References: 11-refactor.md:896-961; apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-feed-publisher.adapter.ts:26-83; .omo/drafts/mega-refactor-tramos.md:110 (C2)
     Acceptance criteria: `grep -rn "vip-calls\|KOL_BOT" apps/feed-publisher/src/telegram` vacío
     QA scenarios: happy send por tipo; failure token ausente → error claro sin postear. Evidence .omo/evidence/task-7-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): adapters telegram crypto+threads
- [x] 8. Threads esqueleto + contrato des-stubbeo C1 (11-refactor §9)
     What to do / Must NOT do: `thread-builder/scheduler` + 3 use-cases + cron + entidades + controller que exponen el stub que Tramo 1 fijó (mismos 501); documento CONTRATO de des-stubbeo (qué endpoints se activan en v2, qué consume kol: `threadConfig`, bot threads). Tests stub + partial-publish matrix (PARTIAL retry desde mensaje 2, FAILED sin retry, IN_PROGRESS backoff).
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 10
     References: 11-refactor.md:794-893; plan Tramo 1 todo 10 (stub fijado); .omo/drafts/mega-refactor-tramos.md:111 (C1)
     Acceptance criteria: matriz partial/failed/transient verde en suite; contrato escrito y referenciado por ambos tramos
     QA scenarios: happy stub coherente con T1; failure publish parcial → resume desde mensaje 2. Evidence .omo/evidence/task-8-mega-refactor-feed-publisher.log
     Commit: Y | feat(feed-publisher): threads esqueleto y contrato v2
- [x] 9. Frontend: 4 endpoints críticos + flags UI (C-UX-01)
     What to do / Must NOT do: Migrar sub-tabla T2 (queue stats, matching config, llm config, ads) a `:3040/41/42` + `VITE_FEED_PUBLISHER_URL` + toggles 3-flag (`MatchingToggleButton`) + proxies vite/nginx. Playwright 4 flujos. Must NOT romper dashboard KOL (Tramo 1).
     Parallelization: Wave 4 | Blocked by: 5, 6, 7 | Blocks: 10
     References: plan central C-UX-01 sub-tabla Tramo 2; .kiro/specs/refactor-feed-publisher/MIGRATION-PLAYBOOK.md:124-145; apps/frontend/src/shared/api/endpoints.ts:143-152 (feedPublisher) y :99-135 (threads)
     Acceptance criteria: `npx playwright test -g "feed-publisher"` 4/4 verde
     QA scenarios: happy toggles optimistas; failure API caída → empty-state. Evidence .omo/evidence/task-9-mega-refactor-feed-publisher.log + capturas
     Commit: Y | feat(frontend): endpoints feed-publisher
- [ ] 10. Staging 7d + rollback rehearsal (playbook)
      What to do / Must NOT do: Deploy staging (:3041), validación 7 días, rehearsal rollback 30min medido (flag off + backend legacy), dashboards Grafana (queue depth, publish rate, LLM latency, dedup hits, failed, CPU/mem). Suites legacy green. Must NOT skipear staging.
      Parallelization: Wave 4 | Blocked by: 9 | Blocks: 11
      References: .kiro/specs/refactor-feed-publisher/MIGRATION-PLAYBOOK.md:52-110 (go/no-go, impacto, rollback 7 pasos); PHASE-TRACKER.md (E2E 6 críticos)
      Acceptance criteria: `/tmp/qa-tramo2.log` con 7 días + rehearsal <30min + 6 E2E verdes
      QA scenarios: happy métricas en objetivo; failure >5% failed >30min → rollback (P0 playbook). Evidence /tmp/qa-tramo2.log + .omo/evidence/task-10-mega-refactor-feed-publisher.log
      Commit: N | — | —
- [ ] 11. Cutover + cleanup Tramo 2 (guide sem 6-7) What to do / Must NOT do: `USE_FEED_PUBLISHER=true` dev→staging→prod (día 1/3/7); monitor; tras validación: deprecation headers (5 fases, `scripts/add-deprecation-headers.js`) + borrar BCs backend feed + migrar uploads; backend pierde ~15k LOC. Rollback listo.
      Parallelization: Wave 4 | Blocked by: 10 | Blocks: Tramo 3 (precondition)
      References: .kiro/specs/refactor-feed-publisher/IMPLEMENTATION-GUIDE.md:563-600+; MIGRATION-PLAYBOOK.md:234-300
      Acceptance criteria: `curl -s localhost:3042/api/queue/stats` 200 en prod + `ls apps/backend/src/telegram | grep feed` vacío
      QA scenarios: happy publish end-to-end prod; failure → rollback + medición. Evidence .omo/evidence/task-11-mega-refactor-feed-publisher.log
      Commit: Y | feat(feed-publisher)!: cutover y cleanup feed backend
- [ ] 12. BCs content-templates + sessions (P33 + P34)
      What to do / Must NOT do: (a) `src/content-templates/`: PublishingTemplate espejo kol-system (keywords elegibles, source filter, prompt-template LLM global reutilizable, target telegram/threads/ambos, queue+matching+scheduling+filters propios, content filters propios, bot DB frontend) + scheduling one-shot + recurrente (ads migrado, "scheduling posts"). (b) `src/sessions/`: tab = sesión (cargar template o ad-hoc); por sesión: sources on/off (toggles, NO crea sources), keywords, matching/publishing/llm on/off, scheduling propio, N bots telegram + N threads, active/inactive, CRUD frontend; dedup + prompt-templates globales compartidos. Tests + e2e tabs. Must NOT tocar kol (P32); threads impl solo esqueleto previo (aquí sí se implementa target threads por sesión).
      Parallelization: Wave 4 | Blocked by: 3, 4, 5, 6, 7 | Blocks: 9 (frontend), 11
      References: .omo/drafts/mega-refactor-tramos.md (P33, P34); .omo/evidence/content-templates-research.md; .kiro/specs/refactor-feed-publisher/11-refactor.md:2516-3560 (v3); apps/kol-system/src/templates/ (patrón)
      Acceptance criteria: `npx jest src/content-templates src/sessions` verde (2 sesiones activas con configs distintas publican a targets distintos; global dedup compartido)
      QA scenarios: happy multi-tab; failure sesión inactiva no consume ni publica. Evidence .omo/evidence/task-12-mega-refactor-feed-publisher.log
      Commit: Y | feat(feed-publisher): templates y sessions multi-tab

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Un commit por todo (feat(feed-publisher): …). Cutover con `!`. Push a la rama; PR a `dev` al Gate T2.

## Success criteria

- `apps/feed-publisher/` en prod con `USE_FEED_PUBLISHER=true`; backend −~15k LOC feed.
- Rollback ensayado <30min; 6 E2E + 4 flujos Playwright verdes; staging 7d en evidencia.
