# refactor-feed-frontend - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Two Spanish docs under `.kiro/specs/refactor-feed-frontend/`: a raw inventory of everything actually mounted on the `/feed` page (organized by frontend layers, with a per-section table of which specialized app serves it on dev ports), and a refactor doc with your 12 locked decisions plus open rounds to keep defining together step by step.

**Why this approach:** The hub mixes four backend owners behind one page, so the overview maps each visible section to its real serving app first; the refactor then follows the owner order you chose (adapters first, feed-only) with full wire rename under dual-serve instead of big-bang.

**What it will NOT do:** It won't touch any product code, ports, or configs; it won't inventory `/threads`, `/playground`, templates, market-data, or dexter; it won't write the final design in one shot.

**Effort:** Short
**Risk:** Medium - plan-hygiene Momus round 7 PASS (7 rounds); sube a High si Fase-0 falla.
**Decisions to sanity-check:** D7 4-owner split (scheduling-posts owns when/how-much), D11 wire rename per-surface (A6) starting with HTTP prefixes, D9 telegram-bots centralizes live `src/target/` (not dead `telegram/` leg).

Your next move: run `$start-work` to execute, or ask for a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- `.kiro/specs/refactor-feed-frontend/overview.md` CRUDO: inventario FSD de todo lo montado en la ruta `/feed` (solo lo que hay, cero planes futuros), con matriz de conectividad dev por sección (`:5173` → `:3030/:3031/:3040/:4080` + prefijo proxy).
- `.kiro/specs/refactor-feed-frontend/refactor.md` con las 12 decisiones ya fijadas (D1–D12) + rondas abiertas para la definición conjunta restante (protocolo interactivo, nunca redactado de golpe).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Cero código producto: no tocar wire, nginx, vite, ni ninguna app. Solo docs.
- `widgets/template-dashboard`, market-data/dexter, kol-system: fuera. `/threads` y `/playground`: mención de una línea como vecinos, sin inventariar.
- No renombrar nada aún (los renames `crypto-news`→`feed`, `content-templates`→`templates`, `useProfile*`→`useSession*` son fase futura del refactor, bajo dual-serve).
- No emojis como iconos en ejemplos de UI; español en los docs (convención `.kiro/specs` familia mega-refactor).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (docs-only) + cita-check ligero post-escritura (tests-after ligero según dueño: verificar que cada path/endpoint citado existe vía grep; sin Vitest/Playwright nuevos).
- Evidence: .omo/evidence/task-<N>-refactor-feed-frontend.log

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 0: spikes 0a–0f en paralelo (solo lectura + apéndices), bloquean todo lo demás.
- Wave 1: (histórica, ya ejecutada pre-gate) todos 1+2 en paralelo, todo 3 después. Gate vigente: F1 re-verifica 1–3 contra salidas de Fase 0 (rework si hay drift).

### RISK register (IDs citados en todo 0)

| ID     | Riesgo                                           | Mitigación = spike/apéndice             |
| ------ | ------------------------------------------------ | --------------------------------------- |
| RISK-1 | Prefijos proxy/nginx divergen (staging/prod 502) | 0d → matriz A6 + follow-up nginx        |
| RISK-2 | Constantes/env bifurcados (36 vs 500)            | 0e → A9 seeds congelados + owner config |
| RISK-3 | `toFeedType`/hooks sin path (lista 0f-CREA)      | 0f → A8/B12 paths + firmas              |
| RISK-4 | Rutas eta/delivery sin controller/DTO            | 0f → B9/R1/R2 paths + formas            |

### Dependency matrix

| Todo                           | Depends on                                   | Blocks         | Can parallelize with |
| ------------------------------ | -------------------------------------------- | -------------- | -------------------- |
| 0. Fase 0 anclaje              | —                                            | 1, 2, 3, F1–F4 | —                    |
| 0g. Runbook staging            | CUT                                          | CUT            | —                    |
| 1. overview.md CRUDO           | 0 (ejecutado pre-gate; F1 re-verifica)       | 3              | 2                    |
| 2. refactor.md D1–D12 + rondas | 0 (ejecutado pre-gate; F1 re-verifica)       | 3              | 1                    |
| 3. cita-check + evidence       | 0, 1, 2 (ejecutado pre-gate; F1 re-verifica) | F1–F4          | —                    |
| 4. WORKTREE registry           | — (hecho, commiteado da788e7f en dev)        | —              | —                    |
| 5. Remediación F+G             | 0 (hecho; F1 re-verifica A1–A10/B8–B12)      | F1–F4          | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 0. Fase 0 anclaje (spikes 0a–0g ejecutados 2026-10-02, apéndices FASE-0-0a..0g consolidados en refactor.md): 0a inventario `src/target/` feed-publisher (dispatcher vivo, pacing, bindings) + `src/telegram/` (qué muere/qué se fusiona) → apéndice B8-bloque `git mv` exacto; 0b pines queue (read-site `QUEUE_CRON_ENABLED`, URL de poll PQ, dueño probe, flags MATCHING/QUEUE defaults, TypeORM wiring file) → A3 ejecutable; 0c DDL+migraciones reales (nombres con timestamp, columnas, backfill LlmConfig→policies, `enabled` en TargetBinding) → A4/A5/A7/B11 ejecutables; 0d paridad+wire (controller parity `{total,diverged,records}`, signer HMAC path, matriz 8 superficies con archivos, gate regexes P10/P32 nuevos, follow-up nginx `/feed-api`+`/scheduling-api`) → A2/A6/B10 + RISK-1 cerrados; 0e constantes+env (owner `publishing-queue/shared/config`, seeds 500/24 congelados, warning `deprecated seed`, `skipped` sin estado nuevo — usa BLOCKED con ref) → A9/RISK-2 cerrado; 0f frontend dual (CREA — ver lista 0f-CREA: path `toFeedType()`, firmas `useSession*` + barrel, lista endpoints que cruzan `feedPublisherPath()`→`schedulingPath()`, paths `formatQueueEta()` + `DeliveryPolicy` view + `delivery-policies/:target` + `rotation-config` dual) → A8/B12/B9/R1/R2/RISK-3/RISK-4 cerrados; 0g auditoría docs-only de `docs/deployment/staging-twin-runbook.md` (verificar puertos/compose/env/DBs/comandos contra código + probes read-only al droplet, marcar STALE, reescribir con P31 manteniendo filename) → bloquea CUT (no Fase 0). Cada spike escribe su apéndice en refactor.md y se verifica por grep. Bloquea F1 (los todos 1–3 se ejecutaron pre-gate y F1 los re-verifica).
     Parallelization: Wave 0 | Blocked by: — | Blocks: 1, 2, 3, F1–F4
     References (pins path:line verificados en reviews): apps/feed-publisher/src/target/application/dispatch/target-queued-article.dispatcher.ts:17-23 (drain vivo); apps/feed-publisher/src/telegram/telegram.module.ts:23-28 (@deprecated a src/target/); apps/feed-publisher/src/queue/domain/publisher-queue-entry.entity.ts:23-45 (props sin eta), :315-318 (releaseToPending); apps/feed-publisher/src/queue/application/services/queue-manager.service.ts:35-37 (cap 36 código) + :70-89 (counts); apps/feed-publisher/src/queue/api/http/queue.controller.ts:31-42 (QueueStatsView), :68 (@Controller api/queue); apps/feed-publisher/src/matching/application/scheduling/enqueue-matching-cron.scheduler.ts:71 (MATCHING_CRON_ENABLED); apps/feed-publisher/src/llm/domain/llm-config.entity.ts:11-24 (12 campos), :139-141 (shouldGenerateLlm); apps/feed-publisher/src/target/domain/target-binding.ts:23-37 (sin enabled); apps/feed-publisher/src/shared/value-objects/content-type.vo.ts:10,19-23 (CONTENT_TYPES dual a parchear); apps/scheduling-posts/src/scheduling/domain/scheduling-config.entity.ts:9-12 (SchedulingTargetLimits), :66-87 (seeds env); apps/scheduling-posts/src/scheduling/api/http/scheduling-rotation-config.controller.ts:21 (ruta singleton); apps/scheduling-posts/src/scheduling/api/input/scheduling.input.ts:146 (SchedulingTargetLimitsDto); apps/scheduling-posts/src/telegram/api/http/telegram-parity.controller.ts:13-19 (shape {total,diverged}); apps/frontend/src/entities/feed-session/api/feed-session-queries.ts:29,449-451,493-495 (Views, alias, keys); apps/frontend/src/entities/feed/api/feed-queries.ts:80-93 (tipos wire + feedKeys); apps/frontend/src/shared/api/endpoints.ts:181,198,200,202-207,222-224 (rutas reales); apps/frontend/vite.config.ts:63-164 (proxies), :145-153 (/feed-api + /scheduling-api dev-only).
     Acceptance criteria (agent-executable): cero disyunciones abiertas en `.kiro/specs/refactor-feed-frontend/` (`grep -rE --include='*.md' -e 'elegir (global-vs|una)' -e 'o viceversa' -e 'abierto, no asumir' .kiro/specs/refactor-feed-frontend/ | wc -l` == 0); todo pin de la lista VERIFICADOS existe (cita-check solo sobre esa lista); la lista 0f-CREA está explícitamente excluida del cita-check (son targets a crear, no pines).
     0f-CREA (targets del spike 0f, NO pines — excluidos del cita-check): `apps/frontend/src/entities/feed/model/to-feed-type.ts` (`toFeedType()`), `formatQueueEta()` (path lo fija 0f: `entities/feed/model/` o `features/publishing-queue/model/`), `useSession*` en `entities/feed-session/model/use-feed-sessions.ts` + barrel, `features/publishing-queue/` (scaffold nuevo: `api/publishing-queue-api.ts`, `ui/` Control/queue/badges).
     QA scenarios: happy = Momus round 5 PASS; failure = un pin roto detectado por cita-check. Evidence .omo/evidence/task-0-refactor-feed-frontend.log
     Commit: N
- [x] 1. Escribir overview.md CRUDO del /feed
     What to do / Must NOT do: Crear `.kiro/specs/refactor-feed-frontend/overview.md` con header `# Refactor Feed Frontend - Overview` + bloque Versión/Fecha/Ubicación; inventario por capas FSD (app/pages/widgets/features/entities/shared) con rol de una línea + líneas por archivo; tabla por sección visible: sección → slice FSD → archivos → endpoint → app:puerto dev + prefijo proxy; matriz dev completa (`:5173`→`:3030` backend, `:3031` ingestion, `:3040` feed-publisher, `:4080` scheduling-posts; nota de una línea staging/prod). Cero propuestas futuras. Must NOT: inventariar /threads, /playground, template-dashboard, market-data, dexter (mención de una línea como máximo).
     Parallelization: Wave 1 (histórica pre-gate) | Blocked by: 0 (retro; F1 re-verifica) | Blocks: 3
     References (executor has NO interview context - be exhaustive): apps/frontend/src/pages/feed/index.tsx (hub 601 líneas, imports 13-28); apps/frontend/src/app/router/routes.tsx:32 (ruta feed) + :33-34 (redirects); apps/frontend/src/app/layouts/root-layout.tsx:7 (nav); apps/frontend/src/widgets/feed-sessions/ui/feed-sessions-section.tsx (202), session-window.tsx (332), session-tabs.tsx (796), session-management-panel.tsx (232), recent-with-badges.tsx (152), index.ts (13); apps/frontend/src/features/feed-publisher/{api,model,ui}/ + index.ts; apps/frontend/src/features/feed-scheduling/{api,model,ui}/ + index.ts; apps/frontend/src/features/feed-filters/ui/content-filter-manager.tsx + index.ts; apps/frontend/src/features/manage-feed-sources/{api,model,ui}/ + index.ts; apps/frontend/src/entities/feed/api/feed-queries.ts + model/use-feed.ts + index.ts; apps/frontend/src/entities/feed-session/api/feed-session-queries.ts + model/use-feed-sessions.ts + model/feed-session-helpers.ts + index.ts; apps/frontend/src/shared/api/endpoints.ts (secciones feed ll.87-278); apps/frontend/src/shared/api/feed-publisher-base.ts + scheduling-base.ts; apps/frontend/vite.config.ts:13-164 (proxies); apps/frontend/AGENTS.md §BACKEND CONTRACT/§PROXY (verificar, no copiar a ciegas).
     Acceptance criteria (agent-executable): el archivo existe; cada path citado pasa `test -f`; cada endpoint citado aparece en `shared/api/endpoints.ts` (grep); la palabra "futuro"/"debería" no aparece fuera de una nota de alcance.
     QA scenarios (name the exact tool + invocation): happy = `grep -c "ingestion-api\|feed-api\|scheduling-api" .kiro/specs/refactor-feed-frontend/overview.md` > 0 y `bash -c 'while read p; do test -f "$p"; done < <(grep -o "apps/frontend/src/[^ )`]\*" .kiro/specs/refactor-feed-frontend/overview.md | sort -u)'` todo-existe; failure = forzar un path inexistente y comprobar que el cita-check lo detecta. Evidence .omo/evidence/task-1-refactor-feed-frontend.log
     Commit: N (sin commit sin petición explícita)
- [x] 2. Escribir refactor.md con D1–D12 + rondas (R1–R6 RESUELTA, 0 pendientes)
     What to do / Must NOT do: Crear `.kiro/specs/refactor-feed-frontend/refactor.md` con las 12 decisiones fijadas por el dueño (D1 slices sessions+messages; D2 Queue tab con 3 switches + badges; D3 ETA aleatoria ya con etaMs+deadlineAt; D4 asigna feed-publisher; D5 delay/cap fuera de LlmConfig, LLM vía ai-ml; D6 queue+pacing migran a scheduling-posts; D7 split 4 dueños; D8 features/publishing-queue + app scheduling-posts→publishing-queue con scheduled/scheduling/health/gateway (telegram/ absorbido) + árbol FIJADO; D9 telegram-bots centraliza adapters vivos `src/target/`; D10 orden adapters-primero solo-feed; D11 wire por superficies con dual-serve (A6, HTTP primero); D12 LlmConfig slim) + R1–R6 RESUELTA + árbol FIJADO + apéndices A1–A10/B8–B12. Must NOT: redactar el diseño final de golpe; solo decisiones fijadas + preguntas.
     Parallelization: Wave 1 (histórica pre-gate) | Blocked by: 0 (retro; F1 re-verifica) | Blocks: 3
     References (executor has NO interview context - be exhaustive): .omo/drafts/refactor-feed-frontend.md (ledger de decisiones del dueño); apps/feed-publisher/src/llm/domain/llm-config.entity.ts:11-24 (campos actuales LlmConfig); apps/feed-publisher/src/queue/ (PublisherQueueEntry + drain/TTL); apps/feed-publisher/src/sessions/ (PublishingSession) + src/template/ (PublishingContentTemplate, rutas /api/content-templates); apps/scheduling-posts/src/{scheduled-posts,scheduling,telegram}/ (P38 pacing, fire-due); apps/feed-publisher/src/telegram/ (adapters @deprecated dual-leg); apps/telegram-bots-gateway/ (dueño transporte); apps/frontend/src/entities/feed-session/ + apps/frontend/src/features/feed-publisher/ui/llm-config.tsx (Daily cap/reset/delay actuales).
     Acceptance criteria (agent-executable): el archivo existe; contiene las 12 Dx (`grep -cE '^- D[0-9]+ ' .kiro/specs/refactor-feed-frontend/refactor.md` == 12); R1–R6 marcadas RESUELTA (0 pendientes); A1–A10 + B8–B12 presentes; no contiene código producto.
     QA scenarios (name the exact tool + invocation): happy = `grep -cE '^- D[0-9]+ ' .kiro/specs/refactor-feed-frontend/refactor.md` == 12; failure = borrar una D y comprobar que el conteo falla. Evidence .omo/evidence/task-2-refactor-feed-frontend.log
     Commit: N (sin commit sin petición explícita)
- [x] 3. Cita-check cruzado + evidence
     What to do / Must NOT do: Verificar que todo path y endpoint citado en ambos docs existe en el repo, EXCEPTO la lista 0f-CREA del todo 0 (targets futuros a crear, no pines) + paths de diseño futuro en refactor.md (delivery-policies/\*, domain/delivery-policy.vo.ts, apps/publishing-queue); guardar salida en `.omo/evidence/task-3-refactor-feed-frontend.log`; corregir citas rotas (nunca borrar diseño marcado RESUELTA/FIJADO). Must NOT: tocar código producto.
     Parallelization: Wave 2 (histórica pre-gate) | Blocked by: 0, 1, 2 (retro; F1 re-verifica) | Blocks: F1–F4
     References (executor has NO interview context - be exhaustive): .kiro/specs/refactor-feed-frontend/overview.md; .kiro/specs/refactor-feed-frontend/refactor.md.
     Acceptance criteria (agent-executable): cero citas rotas fuera de 0f-CREA (loop explícito desde la raíz: `while read p; do test -f "$p" || echo BROKEN:$p; done < pins.txt` con pins.txt excluyendo 0f-CREA; sin BROKEN); log de evidence existe.
     QA scenarios (name the exact tool + invocation): happy = script en verde; failure = path ficticio de prueba detectado como roto. Evidence .omo/evidence/task-3-refactor-feed-frontend.log
     Commit: N (sin commit sin petición explícita)
- [x] 4. Actualizar WORKTREE.md (registry): +Specs (overview/refactor), Scope OUT con fases backend D6–D12 fuera de este worktree, Puertos con upstreams :3031/:3040/:4080 compartidos. Solo WORKTREE.md tocado (diff-stat verificado); sin commit (regla SOLO-GIT: el commit va en principal dev).
     Parallelization: hecho fuera de waves (registry) | Blocked by: — | Blocks: — / Commiteado: da788e7f en dev.
- [x] 5. Remediar high-accuracy review FAIL×2 — lote F (overview: 935/1490, Outlet:45, LlmConfig 12 campos, proxies exactos + dual /feed-publisher vs /feed-api; verificado por grep) + lote G (apéndices A1–A10 en refactor.md: adapters target/ vivo, paridad P42, single-writer, migración DeliveryPolicy, triple eta, matriz wire 8 superficies, migración LlmConfig, dual-alias frontend, constantes/env, exact-time UI). Riesgo del plan subido a High (baja a Medium solo con Fase-0 Momus PASS).
     Parallelization: hecho fuera de waves (docs) | Blocked by: 0 (Fase 0 lo re-cubre) | Blocks: F1–F4 / F1 re-verifica A1–A10/B8–B12.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Docs (todos 0–5): ya commiteados (`da788e7f` registry, `4c297552` specs+plan). Implementación: commit atómico por spike/round + 1 PR por round contra `dev` (squash al merge, GOVERNANCE.md). Sin `--no-verify`; CI debe pasar por PR.

## Rollout strategy (rounds de implementación, los desglosa Fase 0 en todos ejecutables)

| Round | Contenido                                                                                                                                                                         | Commit                                                           | PR contra dev                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| F0    | Spikes 0a–0f (solo apéndices en refactor.md)                                                                                                                                      | `docs(feed-frontend): fase 0 anclaje`                            | PR-0 (docs)                                              |
| R-a   | Adapters: `src/target/`→`gateway/`, merge gateway infra, DELETE bot-api muerto, gate KOL-bot                                                                                      | `refactor(publishing-queue): gateway absorbe target`             | PR-a                                                     |
| R-b   | Queue: `src/queue/` mudado + `etaMs/deadlineAt` + single-writer + TypeORM wiring                                                                                                  | `refactor(publishing-queue): cola mudada con ETA`                | PR-b                                                     |
| R-c   | DeliveryPolicy + migración LlmConfig→policies (`migrateLlmConfigToPolicies`, backfill id=1)                                                                                       | `refactor(publishing-queue): delivery-policy + migración`        | PR-c                                                     |
| R-d   | Wire por superficies A6 (HTTP primero, resto después), dual-serve + JSDoc @deprecated                                                                                             | `refactor(feed): wire dual superficie <n>` (1 commit/superficie) | PR-d (por superficie o agrupado)                         |
| R-e   | Frontend: tipos R3, tabs incl. Control, `features/publishing-queue`, badges/countdown, dual-alias sin borrado                                                                     | `refactor(frontend): slices feed + publishing-queue`             | PR-e                                                     |
| CUT   | Cutover: borra dual-serve + todo @deprecated legacy (shims, alias, rutas/columnas viejas, tipos anchos), estrecha tipos; SOLO tras staging verde en ambos ledgers (`diverged==0`) | `refactor!: cutover feed (rompe compat legacy)`                  | PR-cut (con checklist rollback: revert restaura el dual) |

Reglas: 1 round = 1 PR; PR describe superficie + dual-state + rollback; `main`/`master` nunca directo; `dev`→`master` por squash-PR (GOVERNANCE.md); cada PR cita su apéndice (A1–A10/B8–B12) y su evidence log.

## Retención (orden del dueño 2026-10-01)

Al final del plan NO eliminar el worktree `/Users/bryanstevens/dev/onchain-bot-feat-feed` ni la rama `feat/feed-frontend` hasta que el dueño complete sus pruebas manuales y lo autorice explícitamente. El worker no corre `git worktree remove` ni borra ramas en ningún todo/F.

## Success criteria

- `overview.md` describe el 100% de lo montado en `/feed` sin una sola propuesta futura.
- `refactor.md` contiene D1–D12 verificables por grep + rondas abiertas accionables.
- Cita-check en verde, evidence logs en `.omo/evidence/`.
