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
     References: apps/kol-system/src/telegram/ (MultiBotPublisherAdapter, BotTokenResolverAdapter, publish use-cases, publishing.controller); apps/kol-system/src/templates/ (telegram_bots vault, HttpTelegramAdminVerifierAdapter getMe/getChatMember, assign-template-channel); backend legacy mirror backend/src/telegram/vip-calls/shared/.../bot-api-telegram-publisher.adapter.ts (deprecate at cutover — see inventory rows 1-3, 14-17)
     Acceptance criteria: dual-send paridad 0 divergencias + cutover + módulo viejo deprecado
     QA scenarios: happy paridad; failure divergencia → no cutover. Evidence .omo/evidence/task-4-telegram-bots-gateway.log
     Commit: Y | feat(kol-system): publishing vía gateway
- [ ] 5. Migración feed-publisher al gateway
     What to do / Must NOT do: igual que 4 para adapters crypto+threads + bots por sesión/template.
     Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 8
     References: apps/feed-publisher/src/telegram/ (base/crypto/threads adapters, router, rate-limiter, dispatchers, health); apps/feed-publisher/src/sessions/ (RecordingSessionPublisher Bot API binding follow-up) + src/template/ (template-bot vault); backend legacy mirrors backend/src/telegram/crypto-news-publisher/.../bot-api-crypto-news-publisher.adapter.ts + crypto-news-ads/ad-format-publisher.service.ts (deprecate at cutover — see inventory rows 4-7, 18-21; threads-bot ≠ Meta Threads API backend/src/threads/publisher, out of scope)
     Acceptance criteria: paridad + cutover + deprecación
     QA scenarios: happy paridad; failure no cutover. Evidence .omo/evidence/task-5-telegram-bots-gateway.log
     Commit: Y | feat(feed-publisher): publishing vía gateway
- [ ] 6. Migración dexter al gateway
     What to do / Must NOT do: igual que 4 para el bot dexter (lookup + trade buttons) + updates vía router.
     Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 8
     References: apps/dexter-onchain-bot/ (Tramo 3 — IF it exists by then) ELSE backend/src/telegram/chain-dexter-bot/ (bot-client.ts sendMessage/editMessage/answerCallbackQuery/getUpdates/setWebhook, chain-dexter-bot.adapter.ts, webhook.controller.ts webhook+per-chat limiter, update-poller.service.ts, 7 command handlers — see inventory rows 8-11; app dir missing on feat/mega-refactor-tramos 2026-09-25)
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

---

## BOT USAGE INVENTORY (audit 2026-09-25, branch `feat/mega-refactor-tramos`, read-only)

> Method: `grep` passes over `apps/` for `BOT_TOKEN|botToken`, `sendMessage|sendPhoto|sendMediaGroup|sendVideo|sendDocument|answerCallbackQuery|editMessageText`,
> `getUpdates|webhook|setWebhook|polling`, `api.telegram.org|BotApi|PublisherAdapter`, `429|throttle|RATE_LIMIT`,
> `getMe|getChat|OUTPUT_CHANNEL|WEBHOOK_*|telegram_bots|encryptedToken`, `deleteMessage|pinChatMessage|setMyCommands`.
> Spec files (`*.spec.ts`) excluded from the table unless they are the only witness of a behavior.
> Cross-check: every `*_BOT_TOKEN` env name found maps to a row below (no orphan token reads).

### Token sources (all env names found)

| Env var                                                                         | Read at                                                                                                            | Owner app (current branch)                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------- |
| `VIP_CALLS_BOT_TOKEN`                                                           | `apps/backend/src/shared/common/config/app.config.ts:490` → `publishing.vipCalls.botToken`                         | backend (vip-calls sender)                                              |
| `VIP_CALLS_OUTPUT_CHANNEL`                                                      | `app.config.ts:491`                                                                                                | backend                                                                 |
| `CRYPTO_NEWS_BOT_TOKEN`                                                         | `app.config.ts:494` + `apps/feed-publisher/src/shared/config/telegram.config.ts:30`                                | backend (crypto-news/ads sender) + feed-publisher (crypto adapter)      |
| `CRYPTO_NEWS_OUTPUT_CHANNEL`                                                    | `app.config.ts:495` + `feed-publisher/.../telegram.config.ts:32`                                                   | backend + feed-publisher                                                |
| `CHAIN_DEXTER_BOT_TOKEN`                                                        | `app.config.ts:498` + `apps/backend/src/telegram/chain-dexter-bot/bot.config.ts:46`                                | backend (dexter)                                                        |
| `CHAIN_DEXTER_WEBHOOK_SECRET/URL/INGEST_MODE/POLLING_INTERVAL_MS`               | `app.config.ts:509-514` + `bot.config.ts:47-73`                                                                    | backend (dexter)                                                        |
| `THREADS_BOT_TOKEN` / `THREADS_OUTPUT_CHANNEL`                                  | `feed-publisher/.../telegram.config.ts:31,33`                                                                      | feed-publisher (threads adapter — Telegram Bot API shape, separate bot) |
| `TELEGRAM_BOT_TOKEN` (deprecated)                                               | `app.config.ts:383` fallback only, no sender reads it                                                              | none (dead default)                                                     |
| DB vault `telegram_bots.encryptedToken` (AES-256-GCM, `ENCRYPTION_KEY` per env) | `apps/kol-system/src/templates/domain/entities/telegram-bot.entity.ts:21`                                          | kol-system (P23 — zero env token by design)                             |
| DB vault `template_bot_tokens` / template bots                                  | `apps/feed-publisher/src/template/domain/entities/template-bot.entity.ts:11` + `template-encryption.service.ts:19` | feed-publisher                                                          |
| `TELEGRAM_RATE_LIMIT_PER_MINUTE` + `CRYPTO_NEWS                                 | THREADS_RATE_LIMIT_PER_MINUTE`                                                                                     | `feed-publisher/.../telegram.config.ts:26-40`                           | feed-publisher (per-bot limiters) |

### Inventory table

| #   | Usage                                                                                                                                                                                                                          | App / file                                                                                                                                               | Token source                                                                                                                                         | Send / Recv                                                                                         | Rate-limit?                                                                                                                                                                                                  | Migrates in todo                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `VipCallsBotApiPublisherAdapter`: `sendMessage` (:67, POST :238), `sendPhoto` chunk (:279-284), `sendPhoto/sendMediaGroup/sendVideo` stubs (:91-128)                                                                           | backend `telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts`                                                         | `VIP_CALLS_BOT_TOKEN` (env, ctor-bound; throws if empty :51)                                                                                         | send                                                                                                | YES — in-adapter `RATE_LIMIT_MS=60_000` (:25, :135-136, in-memory per process). NO 429/`retry-after` handling                                                                                                | GAP — backend legacy copy; neither todo 4 (kol-system has its own moved copy) nor todo 7 names it → added to todo 7 refs           |
| 2   | `VipCallsPublishUseCase`: `publisher.sendMessage` (:164) + `tryReserve` RESERVED→`sendMessage`→`finalize` (:107-242); explicit NO `deleteMessage` (:242)                                                                       | backend `telegram/vip-calls/vip-channel/application/handlers/vip-calls-publish.use-case.ts`                                                              | same as 1 (via port)                                                                                                                                 | send                                                                                                | dedup via `tryReserve` (idempotent reserve); pacing only from row 1                                                                                                                                          | same as 1                                                                                                                          |
| 3   | `AchievementReachedHandler`: milestone posts via `publisher.sendMessage('', …)` (:47)                                                                                                                                          | backend `telegram/vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.ts`                                                     | same as 1 (via port)                                                                                                                                 | send                                                                                                | same as 1                                                                                                                                                                                                    | same as 1                                                                                                                          |
| 4   | `BotApiCryptoNewsPublisherAdapter`: `sendMessage` (:269, POST :216), `sendPhoto` (:324), `sendVideo` (:398), `sendMediaGroup` (:475), `getChat` verify (:580-588)                                                              | backend `telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts` + `bot-api-http-client.ts:18` (transport)       | `CRYPTO_NEWS_BOT_TOKEN` (env; fail-closed `ok=false` :106-113)                                                                                       | send + recv (`getChat`)                                                                             | NO in-adapter limiter — upstream `SharedThrottleSchedulerService` (random-delay window) + `TypeOrmSlotArbitrator` (mutual exclusion) + `crypto_news_publisher_throttle_state` singleton row. NO 429 handling | GAP — backend legacy copy; feed-publisher todo 7 already moved a read-only copy, backend still live → added to todo 5 refs         |
| 5   | `ProcessNextQueuedArticleUseCase`: dispatch `sendVideo/sendMediaGroup/sendPhoto/sendMessage` (:305-335)                                                                                                                        | backend `telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts`                                                    | same as 4 (via port)                                                                                                                                 | send                                                                                                | same as 4 (throttle+slot checked before publish)                                                                                                                                                             | same as 4                                                                                                                          |
| 6   | `AdFormatPublisherService`: dispatch `sendMessage/sendPhoto/sendVideo/sendMediaGroup` (:77-123) + `PublishAdUseCase` throttle/slot gating                                                                                      | backend `telegram/crypto-news-ads/application/services/ad-format-publisher.service.ts`                                                                   | same as 4 (ads module binds the SAME crypto adapter)                                                                                                 | send                                                                                                | same as 4 but ads bounds + `crypto_news_ads_throttle_state` (own row, same `SharedThrottleSchedulerService` class)                                                                                           | same as 4                                                                                                                          |
| 7   | `LlmConfigController.verifyChannel`: `publisher.getChat` (:291)                                                                                                                                                                | backend `telegram/crypto-news-publisher/api/http/llm-config.controller.ts`                                                                               | same as 4                                                                                                                                            | recv (verify)                                                                                       | n/a (admin-triggered)                                                                                                                                                                                        | same as 4                                                                                                                          |
| 8   | `TelegramBotClient`: `sendMessage` (:90), `editMessageText` (:140), `answerCallbackQuery` (:173), `getUpdates` (:201), `setWebhook` (:235), `deleteWebhook` (:262), `getMe` (:286)                                             | backend `telegram/chain-dexter-bot/infrastructure/telegram/bot-client.ts`                                                                                | `CHAIN_DEXTER_BOT_TOKEN` (env via `bot.config.ts:46`)                                                                                                | send + recv                                                                                         | NO send-side limiter; NO 429 handling                                                                                                                                                                        | todo 6 (via backend path — `apps/dexter-onchain-bot/` does NOT exist yet on this branch; see gap note)                             |
| 9   | `ChainDexterBotAdapter.sendMessage` (:78-86, POST `:86`)                                                                                                                                                                       | backend `telegram/chain-dexter-bot/infrastructure/telegram/chain-dexter-bot.adapter.ts`                                                                  | same as 8                                                                                                                                            | send                                                                                                | none (see row 8)                                                                                                                                                                                             | todo 6                                                                                                                             |
| 10  | 7 command handlers: `command-router.service.ts:71-125` + `start/help`, `/x`, `/z`, `/c`, `/cc`, trade-buttons, settings — `bot.sendMessage` + `bot.answerCallbackQuery`                                                        | backend `telegram/chain-dexter-bot/application/handlers/` (7 files)                                                                                      | same as 8 (via client)                                                                                                                               | send (+ `answerCallbackQuery` receipt-acks)                                                         | INGRESS-side `InMemoryRateLimiter` per chat (see row 11); send-side none                                                                                                                                     | todo 6                                                                                                                             |
| 11  | `POST chain-dexter/webhook` (:60, secret-token check :67-73, per-chat limiter :76-79) + `POST chain-dexter/health` (:92); `UpdatePollerService` `getUpdates` loop (:81, poll 1 s) gated by `ingestMode` (`bot.config.ts:4-26`) | backend `telegram/chain-dexter-bot/infrastructure/telegram/webhook.controller.ts` + `update-poller.service.ts`                                           | same as 8                                                                                                                                            | recv (webhook XOR polling — already mutually exclusive by `ingestMode`, the gateway todo 3 pattern) | YES ingress — `InMemoryRateLimiter(limit=cfg.commandRateLimitPerUser, 60_000)` (:54-57), per process                                                                                                         | todo 6                                                                                                                             |
| 12  | Port def `sendMessage/sendPhoto/sendMediaGroup/sendVideo/getChat` + `SharedThrottleSchedulerService` + `TypeOrmSlotArbitrator` + `publisher-throttle-state` / `ads-throttle-state` / `threads_throttle_states` tables          | backend `telegram/shared/` + `threads/publisher/` (throttle bridge)                                                                                      | n/a (infra)                                                                                                                                          | n/a                                                                                                 | Per-BC random-delay windows + slot arbitration (product pacing, NOT Telegram-quota pacing); nothing global per bot                                                                                           | gateway todos 2-3 replace this layer                                                                                               |
| 13  | `ConfigConnectivityService.checkTelegramBot`: `GET api.telegram.org/bot<token>/getMe` (:104) for vipCalls                                                                                                                      | backend `src/shared/common/config/config-connectivity.service.ts`                                                                                        | `VIP_CALLS_BOT_TOKEN`                                                                                                                                | recv (health)                                                                                       | n/a                                                                                                                                                                                                          | todo 7 (health-per-bot moves to gateway)                                                                                           |
| 14  | `MultiBotPublisherAdapter`: `sendMessage` (:31, POST `sendMessage` :127), `sendPhotoChunk` (:143-149), 1-min per-bot `throttle` (:71-79), Markdown chunking 4096/1024                                                          | kol-system `src/telegram/infrastructure/telegram/multi-bot-publisher.adapter.ts`                                                                         | DB vault per call (`SendMessageInput.botToken`, resolved by `BotTokenResolverAdapter` ← `telegram_bots.encryptedToken` decrypt) — NO env token (P23) | send                                                                                                | YES — per-bot `RATE_LIMIT_MS=60_000` in-memory map (:26, :74-76). NO 429 handling                                                                                                                            | todo 4                                                                                                                             |
| 15  | `ManualPublishUseCase` (:79) + `PublishFromTemplateUseCase` (:110) → `publisher.sendMessage`; `PublishingController` HTTP trigger; `PublishingJob` RESERVED→published/failed                                                   | kol-system `src/telegram/application/use-cases/` + `api/http/publishing.controller.ts`                                                                   | same as 14                                                                                                                                           | send (triggered by own HTTP, not Telegram ingress)                                                  | dedup via `PublishingJob` reserve; pacing from row 14                                                                                                                                                        | todo 4                                                                                                                             |
| 16  | `HttpTelegramAdminVerifierAdapter`: `getMe` (:19) then `getChatMember` (:23, admin/creator only); `AssignTemplateChannelUseCase` decrypts catalog token (:49) + verifies (:50)                                                 | kol-system `src/templates/infrastructure/telegram/http-telegram-admin-verifier.adapter.ts` + `application/use-cases/assign-template-channel.use-case.ts` | DB vault token (decrypted per call)                                                                                                                  | recv (verify)                                                                                       | n/a                                                                                                                                                                                                          | todo 4 (verify-on-assign moves to gateway or stays — decide in todo 4)                                                             |
| 17  | `TelegramBot` vault entity + `TelegramBotRepository` + CRUD use-cases + `TelegramBotsController` (redacted reads) + AES-256-GCM `EncryptionService` (`ENCRYPTION_KEY`)                                                         | kol-system `src/templates/` (domain/entities, infrastructure/security, api/http)                                                                         | DB vault (self-contained)                                                                                                                            | n/a (vault)                                                                                         | n/a                                                                                                                                                                                                          | todo 4 — NOTE: kol-system vault already implements the gateway todo 1 pattern; todo 4 is vault→vault data migration, not env→vault |
| 18  | `BaseBotApiAdapter`: `sendMessage` (:195-229), `sendPhoto` (:244), `sendVideo` (:301), `sendMediaGroup` (:362), `getChat` (:436-444); `BotApiHttpClient` transport                                                             | feed-publisher `src/telegram/infrastructure/bot-api/base-bot-api.adapter.ts` + `bot-api-http-client.ts`                                                  | `CRYPTO_NEWS_BOT_TOKEN` (crypto subclass :38-39) / `THREADS_BOT_TOKEN` (threads subclass :36-37), fail-closed naming the env                         | send + recv (`getChat`)                                                                             | YES — per-bot `TelegramRateLimiter` (fixed 60 s window, default 20/min, `*_RATE_LIMIT_PER_MINUTE` overrides); over-limit → fail-closed `ok=false` (:77-82, NO queue-and-retry, NO 429 handling)              | todo 5                                                                                                                             |
| 19  | `TelegramPublisherRouter` (route by contentType/scheduling target) + `TelegramQueuedArticleDispatcher` (:51-59) + `TelegramScheduledAdDispatcher` (`sendMessage` :76)                                                          | feed-publisher `src/telegram/application/` (services, dispatch)                                                                                          | same as 18 (via adapters)                                                                                                                            | send                                                                                                | same as 18                                                                                                                                                                                                   | todo 5                                                                                                                             |
| 20  | `TelegramHealthIndicator` (token-presence read :25-28, no send) + `telegram.config.ts` token/channel/rate reads                                                                                                                | feed-publisher `src/telegram/health/` + `src/shared/config/`                                                                                             | env reads only                                                                                                                                       | neither (health ghost — no `getMe` call)                                                            | n/a                                                                                                                                                                                                          | todo 5 (replace with gateway health)                                                                                               |
| 21  | `RecordingSessionPublisher` — records plans, NO Bot API calls (header: "Bot API binding follow-up") + `template-bot.entity.ts` vault + `TemplateEncryptionService`                                                             | feed-publisher `src/sessions/` + `src/template/`                                                                                                         | DB vault pattern (mirrors kol-system)                                                                                                                | neither yet (future send)                                                                           | none yet                                                                                                                                                                                                     | GAP — todo 5 refs only `src/telegram/`; sessions Bot API binding is unscoped → added to todo 5 refs                                |
| 22  | `ThreadsApiPublisherAdapter` (Meta Threads API, NOT Telegram)                                                                                                                                                                  | backend `src/threads/publisher/`                                                                                                                         | `THREADS_*` OAuth (non-Telegram)                                                                                                                     | n/a                                                                                                 | n/a                                                                                                                                                                                                          | OUT OF SCOPE (not a Telegram bot; gateway todo 5's "threads" = Telegram threads-bot, row 18)                                       |

### Explicitly verified zero-Bot-API (no migration)

- `apps/frontend/src/` — 0 hits for `api.telegram.org|sendMessage|BOT_TOKEN` (dashboard never touches Bot API).
- `apps/ingestion-telegram/src/` — 0 hits (MTProto/GramJS only; stays untouched per plan guardrail).
- `apps/dexter-onchain-bot/` — DOES NOT EXIST on this branch (Tramo 3 future); dexter bot code lives at `apps/backend/src/telegram/chain-dexter-bot/` (rows 8-11).
- `deleteMessage|pinChatMessage|setMyCommands|setChatMenuButton|sendChatAction`: 0 production senders (only `deleteMessage: never-called` invariants in vip-channel specs).

### Headline for gateway design (why todos 2-3 exist)

- 3+ bots × 5 send stacks, each with its OWN in-memory per-process limiter (60 s vip/kol, random-delay crypto/ads, 20/min feed-publisher, per-chat ingress dexter) — a multi-replica burst can jointly exceed Telegram's per-bot quotas (30/s broadcast, ~1/s per chat) with no shared coordination.
- **Zero `429` / `retry-after` handling in ANY send path** (grep `429` hits are all data-provider/Helius docs) — 429s surface as generic failures/TTL-expired retries, never backoff-and-retry. Centralized backoff (todo 2) is new behavior, not a move.
- `getUpdates` ⟷ webhook exclusivity already honored inside dexter (`ingestMode` single switch, `bot.config.ts:4`); gateway todo 3 generalizes it per bot with fan-out.
