# telegram-bots-gateway - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una app `telegram-bots-gateway/` SOLO protección y límites de bots: vault cifrado, send único con rate-limit global, ingress webhook+router y resolver (handle/id/username/avatar). Las apps dejan de guardar tokens. MTProto quieto en ingestion-telegram.

**Why this approach:** Los límites de Telegram son por bot, no por app — tres apps con el mismo bot necesitan un punto único de coordinación o un burst conjunto lo banea. Un ingress único además resuelve que getUpdates/webhook son mutuamente excluyentes por bot.

**What it will NOT do:** No toca MTProto (queda en ingestion-telegram). No migra adapters hasta su todo (kol/feed/dexter siguen funcionando solos).

**Effort:** Medium (7 todos)
**Risk:** Medium - punto único de envío (mitigado: stateless + réplicas)
**Decisions I made for you:** DB propia `onchain_bot_bots[_staging]`; puertos 4070/4071/4072 (verificar lsof); migración por app con dual-send temporal.

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- App `apps/telegram-bots-gateway/` (:4070/71/72 a verificar): vault tokens cifrados (AES-256-GCM + ENCRYPTION_KEY por env), send gateway con rate-limit global por bot (30/s broadcast, ~1/s por chat, backoff centralizado ante 429), ingress único webhook + router de updates a apps (kol-system, feed-publisher, dexter-onchain-bot), health por bot.
- Migración por app (dual-send temporal + cutover + deprecación): `telegram_bots` (kol) → vault; adapters kol/feed/dexter → clientes HTTP del gateway.
- DB propia `onchain_bot_bots[_staging]`; envs staging+prod; CI/deploy como el resto.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO sesiones MTProto aquí (Bot API solo; cero riesgo AUTH_KEY_DUPLICATED).
- NO lógica de negocio (templates, scoring, matching viven en sus apps).
- NO migrar una app sin su dual-send + cutover verificados.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest + e2e (dual-send parity) + live 429-backoff proof (mock Telegram 429 then success).
- Evidence: .omo/evidence/task-<N>-telegram-bots-gateway.<ext>

## Execution strategy

### Parallel execution waves

> Wave 1: setup+vault. Wave 2: send gateway + ingress router. Wave 3: migraciones por app (kol, feed, dexter). Wave 4: cutover + cleanup.

### Dependency matrix

| Todo                  | Depends on                      | Blocks  | Can parallelize with      |
| --------------------- | ------------------------------- | ------- | ------------------------- |
| 1, 2 (setup+vault)    | central contracts (ports/DB/CI) | 3, 4    | entre sí                  |
| 3 (send), 4 (ingress) | 1, 2                            | 5, 6, 7 | 3 ∥ 4                     |
| 5, 6, 7 (migraciones) | 3, 4                            | 8       | entre sí (apps distintas) |
| 8 (cutover+cleanup)   | 5, 6, 7                         | —       | —                         |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Contrato central pinneado: C-\* v2026-09-24 + P42 (.omo/drafts/mega-refactor-tramos.md). Ejecución FUTURA (tras Tramo 3 + dexter).

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. App setup + vault cifrado
     What to do / Must NOT do: `apps/telegram-bots-gateway/` (NestJS, :4070 dev/:4071 staging/:4072 prod a verificar con lsof, health, compose, Dockerfile CMD dist/main.js, `.env.*` + templates, DB `onchain_bot_bots[_staging]`); tabla `bot_vault` (id, label, token AES-256-GCM, owner_app, created/rotated_at) + CRUD interno + redact; `ENCRYPTION_KEY` por env; rotación sin redeploy. Tests + coverage. Must NOT lógica de envío aún.
     Parallelization: Wave 1 | Blocked by: central C-PORTS/C-DB/C-CI | Blocks: 2-8
     References: apps/kol-system/src/templates/ (patrón telegram_bots a migrar); .omo/drafts/mega-refactor-tramos.md (P42)
     Acceptance criteria: `curl -s localhost:4070/api/health | grep -q '"status":"ok"'` + round-trip cifrado verde
     QA scenarios: happy CRUD vault; failure sin ENCRYPTION_KEY → error claro, sin boot. Evidence .omo/evidence/task-1-telegram-bots-gateway.log
     Commit: Y | feat(telegram-bots-gateway): setup y vault cifrado
- [ ] 2. Send gateway con rate-limit global por bot
     What to do / Must NOT do: `POST /api/bots/:id/send` (message/photo/media-group) con cuota global por bot (30/s broadcast, ~1/s por chat, colas por bot) + backoff centralizado ante 429 (respeta retry-after, reintenta, contabiliza) + idempotencia por (bot, chat, client_msg_id). Tests: burst multi-app simulado no supera cuota; 429 mock → backoff y reenvío. Must NOT políticas de producto (delays/caps quedan en las apps).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5, 6, 7
     References: https://core.telegram.org/bots/api (broadcast 30/s; getUpdates↔webhook excluyentes); adapters actuales kol/feed/dexter (lógica send a migrar)
     Acceptance criteria: `npx jest src/send` verde con test burst-3-apps bajo cuota + test 429-backoff
     QA scenarios: happy envío <RTT+cola; failure 429 persistente → FAILED con evidencia, sin reintento infinito. Evidence .omo/evidence/task-2-telegram-bots-gateway.log
     Commit: Y | feat(telegram-bots-gateway): send con rate-limit global
- [ ] 3. Ingress único webhook + router
     What to do / Must NOT do: webhook receptor por bot + router de updates a apps suscritas (kol-system, feed-publisher, dexter) con firma/secreto por ruta; getUpdates SOLO como fallback si webhook imposible (nunca ambos a la vez por bot). Tests: fan-out a 2 apps; fallback exclusivo. Must NOT lógica de negocio en el router (pasa-through + auth).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5, 6, 7
     References: Bot API docs (mutual exclusion); dexter update-poller (patrón a retirar)
     Acceptance criteria: update de prueba llega a las 2 apps suscritas; getUpdates y webhook nunca activos juntos (test)
     QA scenarios: happy fan-out; failure app caída → reintento con backoff + dead-letter. Evidence .omo/evidence/task-3-telegram-bots-gateway.log
     Commit: Y | feat(telegram-bots-gateway): ingress webhook + router
- [ ] 4. Migración kol-system al gateway
     What to do / Must NOT do: `telegram_bots` → vault (migración datos cifrados de nuevo, NO copiar tokens en plano); adapters kol → clientes HTTP gateway; dual-send temporal (gateway + directo, comparar) + cutover + deprecación módulo telegram kol. Tests paridad.
     Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 8
     References: apps/kol-system/src/telegram/; apps/kol-system/src/templates/ (telegram_bots)
     Acceptance criteria: dual-send paridad 0 divergencias + cutover + módulo viejo deprecado
     QA scenarios: happy paridad; failure divergencia → no cutover. Evidence .omo/evidence/task-4-telegram-bots-gateway.log
     Commit: Y | feat(kol-system): publishing vía gateway
- [ ] 5. Migración feed-publisher al gateway
     What to do / Must NOT do: igual que 4 para adapters crypto+threads + bots por sesión/template.
     Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 8
     References: apps/feed-publisher/src/telegram/
     Acceptance criteria: paridad + cutover + deprecación
     QA scenarios: happy paridad; failure no cutover. Evidence .omo/evidence/task-5-telegram-bots-gateway.log
     Commit: Y | feat(feed-publisher): publishing vía gateway
- [ ] 6. Migración dexter al gateway
     What to do / Must NOT do: igual que 4 para el bot dexter (lookup + trade buttons) + updates vía router.
     Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 8
     References: apps/dexter-onchain-bot/ (Tramo 3)
     Acceptance criteria: paridad + cutover + deprecación
     QA scenarios: happy paridad; failure no cutover. Evidence .omo/evidence/task-6-telegram-bots-gateway.log
     Commit: Y | feat(dexter-onchain-bot): lookup vía gateway
- [ ] 7. Cutover global + cleanup + CI/deploy
     What to do / Must NOT do: flags/corte por app, borrado adapters viejos, CI `ci:gateway` + deploy staging/prod + healthchecks, réplicas (stateless, ≥2 en prod), final review. Must NOT cerrar sin las 3 apps migradas.
     Parallelization: Wave 4 | Blocked by: 4, 5, 6 | Blocks: —
     References: plan central C-CI-01 (extender matriz con gateway)
     Acceptance criteria: 0 tokens fuera del vault (`grep` auditoría) + healthchecks verdes + réplicas
     QA scenarios: happy corte limpio; failure rollback por app. Evidence .omo/evidence/task-7-telegram-bots-gateway.log
     Commit: Y | feat(telegram-bots-gateway)!: cutover global

## Commit strategy

Un commit por todo; migraciones con dual-send verificado; cutover con `!`.

## Success criteria

- Todo envío Telegram pasa por el gateway (auditoría: 0 tokens fuera del vault).
- Rate-limit global verificado con burst multi-app simulado + 429 real/mock.
- Updates con un solo ingress y fan-out a suscritas.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

## Success criteria
