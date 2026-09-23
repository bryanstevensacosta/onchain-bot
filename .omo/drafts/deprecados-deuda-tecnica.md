---
slug: deprecados-deuda-tecnica
status: drafting
intent: unclear
pending-action: write .omo/plans/deprecados-deuda-tecnica.md
approach: <fill: the approach you intend to plan>
---

# Draft: deprecados-deuda-tecnica

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

## Open assumptions (announced defaults)

<!-- Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto. -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

## Decisions (with rationale)

## Scope IN

## Scope OUT (Must NOT have)

## Open questions

## Approval gate

status: drafting

<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

# Draft: deprecados-deuda-tecnica

## Estado

status: awaiting-approval
pending-action: write .omo/plans/deprecados-deuda-tecnica.md
approach: Limpieza por oleadas seguras (backend MTProto → ports/stubs crypto-news → flags/config → ingestion seeders → frontend/dead-code → transversal), cada oleada con tests verdes + compat DI verificada, sin cambios funcionales.

## Contexto rama

- Rama actual: dev (28c259a7 tras pull 2026-09-20)
- Worktree con untracked en .kiro/, .omo/drafts, .omo/plans, docs/opencode-session-transfer.md → riesgo dirty_worktree: fuera de alcance, no tocar.

## Components ledger (topology lock: 6)

1. C1-backend-mtproto: 7 servicios deprecated (flood-wait-counter, sleep-window, last-seen-manager, client-manager, flood-wait-handler, safety-config, media-download) + TelegramMtprotoListenerAdapter + shared-ingestion.module modo MTProto. Reemplazo: SSE (TelegramSseListenerAdapter, INGESTION_TELEGRAM_URL).
2. C2-backend-crypto-news-stubs: ports muertos CryptoNewsMessageRepository / save+delete de SourceRepository, InMemory vacíos, stub CryptoNewsMessage, VO duplicado crypto-news-media, DI shim en crypto-news-publisher.module + crypto-news-ingestion.module.
3. C3-flags-config: INGESTION_SERVICE_URL fallback+warn (app.config.ts:27,90-104), llm_config.matching_enabled columna+entidad+DTO+controller 400-guard, TELEGRAM_BOT_TOKEN deprecated, ghost filters.token.\* seed, INGESTION_REMOTE_URL muerto.
4. C4-ingestion-seeders: KolSeeder + CryptoNewsSeeder + crypto-news.seed.ts (referencia), fetchActiveCryptoNewsSourceIds() → [], BackendChannelProvider legacy BACKEND_PORT fallback, polling comentado legacy SSE.
5. C5-frontend: refs legacy matchingEnabled/endpoints deprecated, dead URLs (kols.backfill, publishing.byToken, reprocess\*, llm-config /api prod, dashboard.kpis comentado), UNUSED DEPS (recharts, zustando, lucide-react, zod, msw cero imports), ScoreTier mismatch, sin error boundaries.
6. C6-transversal: TODOs (ingestion app.config 3x validation, retention recursion, restart logic, title extract), console.log DEBUG hot path (main.ts, mtproto adapter, ADAPTER-SELECTION-DEBUG, [SSE-DEBUG]/[MSG-TRANSFORM-DEBUG]), version skew (root 1.0.0 vs backend 1.2.0 vs frontend/ingestion 1.1.0 vs AGENTS 1.3.2 vs README badges), root tooling sin dev:ingestion + tsc hooks solo backend+frontend, tsconfig dead discovery/_ + duplicated settings/_, terraform.tfvars + .terraform tracked, synchronize-era migraciones, docs stale (README 2-app, 16BCs/14 tablas), backend GAPS 1-27 + ingestion GAPS 1-25.

## Open-assumptions ledger (defaults adoptados, reversibles salvo indicado)

- A1: NO borrar MTProto en esta fase, solo aislar detrás de flag + marcar rollback-only. Rationale: AUTH_KEY_DUPLICATED + prod rollback. Reversible: sí.
- A2: Dropear columna llm_config.matching_enabled SOLO tras verificar backfill 1875 en staging/prod. Rationale: migración histórica. Reversible: no (destructivo) → requiere backup + owner-decisión.
- A3: Ports/stubs C2 se eliminan con migración de consumidores a DTO HTTP, manteniendo tokens DI hasta el final. Rationale: romper DI = build roto. Reversible: sí (revert commit).
- A4: Seeders C4 se eliminan, seed.ts queda como referencia histórica (no código). Rationale: ya muertos. Reversible: sí.
- A5: Deps frontend NO se desinstalan en este plan, solo se decide keep/prune con evidencia de bundle. Rationale: quitar dep puede romper build futuro; es owner-decisión. Reversible: sí.
- A6: console.log DEBUG se migran a Logger, no se borran a ciegas. Rationale: hot path necesita observabilidad. Reversible: sí.
- A7: Versionado: unificar a single-source (package.json) + corregir AGENTS/README, sin cambiar estrategia release manual. Rationale: docs, no código. Reversible: sí.
- A8: Fuera de alcance: backfill/SSE-replay, auth MediaController, health stubs, multi-tenancy, synchronize→migrations prod. Rationale: deuda funcional mayor, otro plan. Se listan como riesgos.

## Enfoque por oleadas (resumen para el gate)

- Onda 0: inventario + red de seguridad (tests baseline backend 170/1969, ingestion 43/815, frontend vitest).
- Onda 1: C1 aislar MTProto (docs + flag + logs).
- Onda 2: C2 migrar consumidores → borrar stubs/ports.
- Onda 3: C3 flags/config (quitar fallbacks, dropear columna con backup).
- Onda 4: C4 seeders ingestion.
- Onda 5: C5 frontend dead-code + decisión deps.
- Onda 6: C6 transversal (logger, versiones, tsconfig, terraform ignore, docs).
- QA por todo: happy+failure, comando exacto, evidencia.

## Gate

status: awaiting-approval — espero tu OK para escribir .omo/plans/deprecados-deuda-tecnica.md con este enfoque. Si tenías un outcome específico en mente (p.ej. solo backend, o solo deprecados con @deprecated), dilo y cambio a modo preguntas.
