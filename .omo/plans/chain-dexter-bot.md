# Chain Dexter Bot — MVP (Iteración 1) + Roadmap 0→100

## TL;DR

> **Quick Summary**: Renombrar `coin-info-bot/` → `chain-dexter-bot/` y construir el wrapper Telegram mínimo viable sobre los BCs existentes del backend (chain/detection + chain/explorer + token/classification + token/scoring + token/honeypot), entregando `/x /z /c /cc /tb /settings` con inline keyboard real, ingest por webhook + polling, y persistencia per-chat (ChatGroup + ChatSettings).
>
> **Deliverables**:
> - Directorio renombrado: `apps/backend/src/telegram/chain-dexter-bot/` (estructura hexagonal DDD)
> - Bot Telegram operativo: webhook + polling, command router, handlers
> - 6 comandos funcionales: `/x /z /c /cc /tb /settings`
> - 2 entidades nuevas: `ChatGroupEntity` + `ChatSettingsEntity` (TypeORM + in-memory)
> - Trade buttons registry con 8 plataformas iniciales + inline keyboard + refresh
> - Roadmap documentado para iteraciones 2-N (leaderboards, holders, AI, twitter, alerts, games, etc.)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves paralelas + 1 rename + 4 final reviews
> **Critical Path**: T1 (rename) → T7-T9 (entities) → T12 (command router) → T14 ( `/x`) → F1-F4 (reviews)

---

## Context

### Original Request

> "renombrarlo a chain-dexter-bot/ será nuestro bot basado en docs/rick-bot y se solo será un wrapper para telegram de todo lo que ya tenemos en backend/src/ así que, revisa lo inicial, el coro de rick, lo más crudo y principal y compara si ya lo tenemos, para ir desde 0 hasta 100, en convertir chain-dexter-bot en el proximo rick-bot killer, con obviamente mejoras que luego iremos iterando para implementar"

> "vamos a crear un plan básico inicial que vamos a iterar juntos"

### Interview Summary

**Decisiones confirmadas**:
- MVP scope = **Solo core scan** (recomendado por el usuario tras las opciones).
- Wrapper-only sobre backend existente (no añadir BCs nuevos en MVP).
- Mejoras (killers sobre Rick) se iteran DESPUÉS del MVP.
- Plan básico inicial = MVP slice + roadmap de iteraciones futuras.
- Idioma: español. Tone: profesional, datos primero.

**Research findings** (resumen):
- `coin-info-bot/` actual = 326 líneas, casi dead-code. `CoinInfoListenerAdapter.handleUpdate()` nunca se invoca. Único endpoint vivo: `GET /coin-info/token?address=`.
- Backend tiene 16 BCs ya construidos. Para MVP se wrappean: `chain/detection`, `chain/explorer`, `token/classification`, `token/scoring`, `token/honeypot`, `chain/registry`.
- 7 archivos afectados por rename. Frontend no consume el endpoint viejo. Cero impacto fuera de los 7.
- Rick-bot tiene ~120 comandos; el MVP cubre el centroide (`/x /z /c /cc /tb /settings`).

### Defaults aplicados (transparentes)

| Decisión | Default | Razón |
|---|---|---|
| Bot ingest | **webhook (prod) + polling (dev)**, configurable por env | Rick hace lo mismo; cubre dev + prod |
| Persistencia | in-memory si `DATABASE_ENABLED=false`, TypeORM si true | ya existe `DatabaseModule.forRootFromEnv()` |
| Cadenas | todas las del backend (SOL, ETH, Base, BSC, TON, FTM, AVAX, ...) | pipeline es chain-agnostic |
| Default `/tb` Solana | `DEX + PHO + TRO` | coincide con default de Rick |
| HMAC secret | `CHAIN_DEXTER_WEBHOOK_SECRET` (opcional, warning si falta en prod) | best practice Telegram webhook |
| Idioma mensajes | español | consistente con repo |
| Tone | profesional, datos primero | diferenciador vs el sarcasmo de Rick |

### Future waves (roadmap — para iterar después del MVP)

> Estas waves NO se incluyen en los TODOs de esta iteración. Se añadirán al plan cuando iteremos.

- **Wave 2**: Discovery commands (`/old /new /pvp /ds /pfs /meta /cto /index`)
- **Wave 3**: ATH Leaderboards (`/ga /groupath /gap /gam /groupburp /runners /today`) — necesita snapshot-history adapter + chat-attribution
- **Wave 4**: Wallets & Holders (`/w /h /nh /wl /wexport /wimport`) — requiere wallet-tracking BC nuevo
- **Wave 5**: AI Commands (`/rick /ask /deep /grok /eli5 /fact /define /tldr /img`) — requiere LLM provider BC
- **Wave 6**: Twitter/𝕏 (`/twit /xd /moni /soc /bsoc /osoc`) — requiere 𝕏 provider BC
- **Wave 7**: Alerts & Reminders (`/dp /ctoalerts /tweetdels /sports /pm /remindme /remind`) — requiere scheduler + alert-subscription entity
- **Wave 8**: Credits & Premium (`/balance /topup /mybalance /transfer`) — requiere credit-ledger entity + Telegram Stars integration
- **Wave 9**: Hub & Mini App integration (mini-app webview + push notifications)
- **Wave 10**: Games & Fun (`/bj /bank /flip /rep /img`) — requiere game-state entity
- **Wave 11**: Group features (`/call /calls /rank /flex /fleximg /flexfont /groupme /hot /last`) — requiere group-token tracking entity

### Killers sobre Rick (ideas para iteraciones futuras — NO implementar en MVP)

1. **Pipeline completo en `/x`** — Rick solo muestra precio/MC; nosotros metemos `classify + score + honeypot + filter decision` sin pedirlo, como Killer feature.
2. **Risk-aware buttons** — ocultar botones de trading si `classification=SUSPICIOUS` o `honeypot.risk>threshold`; mostrar solo tools de análisis.
3. **Multi-chain nativo** — Rick es SOL-first con EVM bolt-on; nosotros somos chain-agnostic desde el BC chain-detection.
4. **Event-driven alerts** — el event bus emite `enrichment.token.enriched`; podemos trigger DexPaid-equivalent sin polling.
5. **Snapshot diff / ATH retroactivo** — `token_snapshots` permite calcular cualquier ventana temporal.
6. **KOL-attributed alpha-callers** — `/alpha` con KOL reputation ponderada (Rick usa group-points planos).
7. **Open anti-scam** — publicar signals de filtros/honeypot públicamente (Rick los tiene cerrados).
8. **Latencia Solana menor** — Helius RPC directo sin hops de agregador.

---

## Work Objectives

### Core Objective

Convertir `coin-info-bot/` (casi dead-code, 326 líneas) en `chain-dexter-bot/` (wrapper Telegram funcional sobre el backend existente) que ejecute los 6 comandos core de Rick-bot y deje el andamiaje listo para iterar el resto.

### Concrete Deliverables

- **Rename completo**: `coin-info-bot/` → `chain-dexter-bot/`, classes renombradas semánticamente, ruta `/coin-info` → `/chain-dexter`, env var `COIN_INFO_BOT_TOKEN` → `CHAIN_DEXTER_BOT_TOKEN`.
- **Bot ingest funcional**: webhook controller + polling service (alternables por env `CHAIN_DEXTER_INGEST_MODE=webhook|polling`).
- **Command router**: dispatcher `/cmd args` → handler con contexto resuelto (chat, user, reply-to).
- **2 entidades nuevas** (per-chat): `ChatGroupEntity`, `ChatSettingsEntity` con TypeORM + in-memory fallback.
- **6 comandos vivos**: `/x /z /c /cc /tb /settings`.
- **Trade buttons registry**: 8 plataformas iniciales (Photon, Axiom, Trojan, Maestro, BananaGun, Jupiter, DexScreener, GeckoTerminal) + análisis (BubbleMaps, Defined).
- **Inline keyboard**: trade buttons + refresh button en cada scan.
- **Mensajería Markdown con escape seguro**: respeta límite de 4096 chars de Telegram.

### Definition of Done

- [ ] `npm run build` compila sin errores en `apps/backend`.
- [ ] `npm run lint` pasa.
- [ ] `npm test` mantiene los 306 tests existentes pasando (sin nuevos tests obligatorios, pero si añades tests, deben pasar).
- [ ] Bot responde a `/x <CA>` en Telegram con tarjeta formateada + inline keyboard.
- [ ] Bot responde a `/tb` con teclado de configuración; `/tb PHO AXI TRO` persiste en `ChatSettings`.
- [ ] Bot rechaza updates no firmados (HMAC) cuando `CHAIN_DEXTER_WEBHOOK_SECRET` está configurado.
- [ ] Bot cae a polling automáticamente si `CHAIN_DEXTER_INGEST_MODE=polling`.
- [ ] QA scenarios de cada task ejecutados + evidencia capturada en `.sisyphus/evidence/`.

### Must Have

- Los 6 comandos (`/x /z /c /cc /tb /settings`) funcionan end-to-end con CAs reales.
- Bot arranca vía webhook O polling según env.
- Inline keyboard aparece en `/x` y permite refresh + trade buttons.
- Persistencia per-chat sobrevive restart del backend (cuando `DATABASE_ENABLED=true`).
- Rename atómico, build limpio, 306 tests pasando.

### Must NOT Have (Guardrails — anti-AI-slop + anti-scope-creep)

- **NO** añadir BCs nuevos en MVP (no wallet-tracking, no LLM, no twitter, no scheduler).
- **NO** implementar los ~114 comandos restantes (eso es iteración 2+).
- **NO** lógica de negocio nueva en el wrapper — todo debe delegar a BCs existentes.
- **NO** MTProto / KOL ingestion (eso es el pipeline `telegram-kol/`, ortogonal).
- **NO** publishing a canales output (eso es `vip-calls-channel/`, ortogonal).
- **NO** frontend changes (la UI del dashboard no se toca).
- **NO** tests E2E completos con Playwright (los QA scenarios son curl + tmux + node).
- **NO** over-abstraction: NO factories, NO strategies, NO decorators innecesarios.
- **NO** emojis decorativos en mensajes (solo los que ya están en los datos del snapshot).
- **NO** console.log en producción.
- **NO** `as any` / `@ts-ignore` / tipos vacíos.
- **NO** migración TypeORM con datos seed — las tablas se auto-crean con `synchronize: true` como el resto del proyecto.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — toda verificación es agent-executed. Sin excepciones.

### Test Decision

- **Infraestructura existe**: YES (Jest, 306 tests, `npm test`)
- **Automated tests**: Tests-after (light tests opcionales, foco en QA agent-executed)
- **Framework**: Jest (ya configurado)
- **Test policy**: NO se requieren tests nuevos para MVP. Si el ejecutor añade tests, deben pasar. Los 306 tests existentes deben seguir pasando intactos.

### QA Policy

Cada TODO incluye **Agent-Executed QA Scenarios** obligatorios. Evidencia en `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

| Tipo de task | Tool | Output |
|---|---|---|
| Bot HTTP / webhook | `curl` (vía Bash) | response body + status |
| Bot polling (dev) | `tmux` (vía interactive_bash) | captura de sesión + logs |
| Persistencia | `curl` + DB inspection | JSON response + query result |
| Telegram sendMessage | mock del bot API con servidor local (http-mock) | request capture |
| Mensaje formatted | inspección del body enviado | texto + keyboard JSON |

Cada scenario: **happy path + failure path mínimo**.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Rename — secuencial, bloquea todo):
└── T1: Rename exhaustivo coin-info-bot → chain-dexter-bot (10 archivos: 7 src + app.module.ts + app.config.ts + .env + .env.example)

Wave 1 (Foundations — 5 tasks paralelas):
├── T2: Bot config + env vars
├── T3: Telegram Bot API HTTP client (typed)
├── T4: Trade buttons registry (8 plataformas)
├── T5: Markdown message formatter (safe escape + 4096 limit)
└── T6: Inline keyboard builder (refresh + trade buttons)

Wave 2 (Per-chat persistence — 3 tasks paralelas):
├── T7: ChatGroupEntity + repository (TypeORM + in-memory)
├── T8: ChatSettingsEntity + repository (TypeORM + in-memory)
└── T9: ChatGroupSettingsService (use cases: getOrCreate, update)

Wave 3 (Bot ingest — 4 tasks paralelas):
├── T10: Webhook controller (POST /chain-dexter/webhook + HMAC)
├── T11: Update poller (long-polling, configurable interval)
├── T12: Command router (parse /cmd args → handler dispatch)
└── T13: Context resolver (chat_id → ChatGroup, user_id → UserContext, reply-to resolution)

Wave 4 (Commands — 6 tasks paralelas):
├── T14: /x command — full scan pipeline + inline keyboard
├── T15: /z command — compact scan
├── T16: /c command — scan + chart link
├── T17: /cc command — chart only
├── T18: /tb command — config inline keyboard + persistence
└── T19: /settings command — read-only display of current settings

Wave FINAL (4 reviews paralelas, esperar user OK):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Presentar resultados -> Esperar OK explícito del usuario

Critical Path: T1 → T7+T8 → T9 → T12 → T14 → F1-F4 → user OK
Parallel Speedup: ~70% más rápido que secuencial
Max Concurrent: 6 (Wave 4)
```

### Dependency Matrix

- **T1**: - — - - 2-19, 1
- **T2-T6**: T1 — 10-13, 14-19, 1
- **T7-T8**: T1 — T9, 1
- **T9**: T7, T8 — T12, T14-T19, 1
- **T10-T11**: T1 — T12, 1
- **T12**: T2, T9, T10, T11 — T14-T19, 1
- **T13**: T7 — T12, 1
- **T14-T19**: T2-T6, T9, T12, T13 — F1-F4
- **F1-F4**: T14-T19 — user OK

### Agent Dispatch Summary

- **Wave 0**: T1 → `git` (rename atómico)
- **Wave 1**: T2-T6 → `quick` (5 tasks en paralelo)
- **Wave 2**: T7-T9 → `quick`/`unspecified-high` (3 tasks en paralelo; T9 un poco más profunda)
- **Wave 3**: T10-T13 → `unspecified-high`/`deep` (4 tasks en paralelo; T12/T13 más profundos)
- **Wave 4**: T14-T19 → `deep`/`unspecified-high`/`visual-engineering` (6 tasks en paralelo)
- **FINAL**: F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Nunca separados.
> Cada task MUST tener: Recommended Agent Profile + Parallelization info + QA Scenarios.
> Un task SIN QA Scenarios está INCOMPLETO. Sin excepciones.

### Wave 0 — Rename (secuencial, bloquea todo)

- [ ] 1. **Rename exhaustivo `coin-info-bot` → `chain-dexter-bot`** (atómico, 8 archivos)

  **What to do**:

  > **Inventario exhaustivo verificado** (no se debe quedar ningún residuo):
  >
  > | # | Archivo | Cambios |
  > |---|---|---|
  > | 1 | `apps/backend/src/telegram/coin-info-bot/` | Directorio → renombrar a `chain-dexter-bot/` |
  > | 2 | `apps/backend/src/telegram/chain-dexter-bot/coin-info-bot.module.ts` | Renombrar a `chain-dexter-bot.module.ts` |
  > | 3 | `apps/backend/src/telegram/chain-dexter-bot/api/http/coin-info.controller.ts` | Renombrar a `chain-dexter.controller.ts` |
  > | 4 | `apps/backend/src/telegram/chain-dexter-bot/application/coin-info.service.ts` | Renombrar a `token-scan.service.ts` |
  > | 5 | `apps/backend/src/telegram/chain-dexter-bot/infrastructure/listeners/coin-info-listener.adapter.ts` | Renombrar a `infrastructure/telegram/chain-dexter-bot.adapter.ts` |
  > | 6 | `apps/backend/src/telegram/chain-dexter-bot/infrastructure/formatters/coin-info-formatter.adapter.ts` | Renombrar a `infrastructure/telegram/message-formatter.adapter.ts` |
  > | 7 | `apps/backend/src/app.module.ts` | Línea 18: import `CoinInfoBotModule` → `ChainDexterBotModule` |
  > | 8 | `apps/backend/src/shared/common/config/app.config.ts` | Shape (línea 80) + factory (línea 249-251): `coinInfoBot` → `chainDexterBot` |
  > | 9 | `apps/backend/src/telegram/chain-dexter-bot/application/token-scan.service.ts` | Interface local `AppConfigShape`: `coinInfoBot` → `chainDexterBot`, campo `coinInfoBotToken` → `chainDexterBotToken`; consumer `cfg?.publishing?.coinInfoBot?.botToken` → `cfg?.publishing?.chainDexterBot?.botToken` |
  > | 10 | `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/chain-dexter-bot.adapter.ts` | Interface local `AppConfigShape`: `coinInfoBot` → `chainDexterBot`; consumer `cfg?.publishing?.coinInfoBot?.botToken` → `cfg?.publishing?.chainDexterBot?.botToken` |
  > | 11 | `apps/backend/.env` | Línea 89-90: comentario `# Coin Info Bot (public bot that responds to contract addresses)` → `# Chain Dexter Bot (public bot that responds to contract addresses)`; línea 90: `COIN_INFO_BOT_TOKEN=<value>` → `CHAIN_DEXTER_BOT_TOKEN=<same-value>`; línea 49 (comentario legacy): `... COIN_INFO_BOT_TOKEN` → `... CHAIN_DEXTER_BOT_TOKEN` |
  > | 12 | `.env.example` (raíz) | Añadir bloque (si no existe): `CHAIN_DEXTER_BOT_TOKEN=`, `CHAIN_DEXTER_WEBHOOK_SECRET=`, `CHAIN_DEXTER_INGEST_MODE=webhook`, `CHAIN_DEXTER_POLLING_INTERVAL_MS=1000`, `CHAIN_DEXTER_DEFAULT_TRADE_BUTTONS=DEX,PHO,TRO` |

  **Renombres semánticos de clases/interfaces** (dentro de archivos renombrados):
  - `CoinInfoBotModule` → `ChainDexterBotModule`
  - `CoinInfoController` → `ChainDexterController`
  - `CoinInfoService` → `TokenScanService`
  - `CoinInfoListenerAdapter` → `ChainDexterBotAdapter`
  - `CoinInfoFormatterAdapter` → `MessageFormatterAdapter`
  - Interface local `TokenInfo` → `TokenScanResult`

  **Otros renombres**:
  - Ruta HTTP: `/coin-info` → `/chain-dexter`
  - Config key global: `coinInfoBot` → `chainDexterBot` (en `app.config.ts`, 2 ocurrencias)
  - Env var global: `COIN_INFO_BOT_TOKEN` → `CHAIN_DEXTER_BOT_TOKEN` (en `.env`)
  - Campo local en services: `coinInfoBotToken` → `chainDexterBotToken`

  **NO renombrar** (orthogonal, otros bots del proyecto):
  - `VIP_CALLS_BOT_TOKEN` (vip-calls-channel/, otro bot)
  - `PUBLISHING_TELEGRAM_BOT_TOKEN` (publishing, otro bot)
  - `TELEGRAM_BOT_TOKEN` (legacy genérico, comentado como deprecated)
  - `TELEGRAM_MTPROTO_*` (MTProto, no es Bot API)

  **Verificación post-rename** (DEBE ser 0 matches antes de commitear):
  ```bash
  # Búsqueda exhaustiva en TODO el repo (excluyendo node_modules, dist, .git, .sisyphus)
  grep -r -i "coin-info\|coininfo\|coininfobot\|coin_info" \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.sisyphus \
    /Users/bryanstevens/dev/onchain-bot/
  # Debe retornar: (empty)
  ```

  **Verificación final**:
  ```bash
  cd apps/backend && npm run build      # exit 0
  cd apps/backend && npm test            # 306 tests passing
  cd apps/backend && npm run lint        # 0 errors
  ```

  **Must NOT do**:
  - NO cambiar lógica de negocio de los archivos (solo renombrar)
  - NO añadir/eliminar funcionalidad
  - NO exponer el valor real del token en logs, commits, o documentación (solo el nombre de la env var)
  - NO renombrar la entity `TokenInfo` en otros BCs (solo la interface local de este módulo)
  - NO cambiar `vip-calls-channel/`, `publishing.module.ts`, ni ningún otro directorio
  - NO tocar `TELEGRAM_BOT_TOKEN`, `VIP_CALLS_BOT_TOKEN`, `PUBLISHING_TELEGRAM_BOT_TOKEN` (bots ortogonales)
  - NO commitear si hay secrets en el diff (verificar con `git diff --staged`)

  **Recommended Agent Profile**:
  - **Category**: `git`
    - Reason: Rename mecánico + verificación atómica
  - **Skills**: [`git-master`]
    - `git-master`: rename atómico verificable con `git mv` + verificación post-rename

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 0 — bloquea todas las waves siguientes)
  - **Parallel Group**: Wave 0 (solo)
  - **Blocks**: T2-T19, F1-F4
  - **Blocked By**: None

  **References**:
  - **Pattern References** (existing code to follow):
    - `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts:1-47` — patrón de NestJS module con HttpModule + ChainRegistryModule (referencia de wiring style)
  - **API/Type References**:
    - `apps/backend/src/shared/common/config/app.config.ts:80` (interface `AppConfigShape.publishing`) y `:249-251` (factory `coinInfoBot.botToken` consumer)
    - `apps/backend/src/app.module.ts:18` — import actual de `CoinInfoBotModule` (a renombrar)
    - `apps/backend/.env:89-90` — definición actual de `COIN_INFO_BOT_TOKEN`
    - `apps/backend/src/telegram/coin-info-bot/application/coin-info.service.ts:7-16,55` — interface local `AppConfigShape` + consumer
    - `apps/backend/src/telegram/coin-info-bot/infrastructure/listeners/coin-info-listener.adapter.ts:8-14,39` — interface local + consumer

  **Acceptance Criteria**:
  - [ ] Directorio `apps/backend/src/telegram/coin-info-bot/` NO existe
  - [ ] Directorio `apps/backend/src/telegram/chain-dexter-bot/` existe con 5 archivos .ts (estructura hexagonal: `api/http/`, `application/`, `domain/`, `infrastructure/telegram/`, `infrastructure/persistence/`, `infrastructure/repositories/`, `chain-dexter-bot.module.ts`)
  - [ ] `grep -r -i "coin-info\|coininfo\|coininfobot\|coin_info" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.sisyphus /Users/bryanstevens/dev/onchain-bot/` retorna 0 matches
  - [ ] `git diff --stat HEAD` muestra ~8 archivos renombrados/modificados (7 del directorio + app.module.ts + app.config.ts + .env + .env.example)
  - [ ] `apps/backend/.env` contiene `CHAIN_DEXTER_BOT_TOKEN=<value>` con el MISMO valor que tenía `COIN_INFO_BOT_TOKEN` (NO regenerar el token, NO exponerlo en logs)
  - [ ] `apps/backend/src/shared/common/config/app.config.ts` tiene 2 ocurrencias de `chainDexterBot` (interface + factory)
  - [ ] `.env.example` (raíz) tiene las 5 env vars de chain-dexter-bot
  - [ ] `npm run build --workspace=apps/backend` exit 0
  - [ ] `npm test --workspace=apps/backend` mantiene 306 tests pasando
  - [ ] `npm run lint --workspace=apps/backend` exit 0
  - [ ] Bot arranca con `CHAIN_DEXTER_BOT_TOKEN=<value> CHAIN_DEXTER_INGEST_MODE=polling npm run dev:backend` (carga config correctamente)
  - [ ] NO se modificaron: `vip-calls-channel/`, `publishing.module.ts`, `VIP_CALLS_BOT_TOKEN`, `PUBLISHING_TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MTPROTO_*`
  - [ ] NO hay secrets visibles en el diff (`git diff --staged` no contiene tokens literales)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Búsqueda exhaustiva sin residuos
    Tool: Bash (grep)
    Preconditions: Rename completado, antes de commitear
    Steps:
      1. grep -r -i "coin-info\|coininfo\|coininfobot\|coin_info" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.sisyphus /Users/bryanstevens/dev/onchain-bot/
      2. assert output is empty
    Expected Result: 0 matches en todo el repo
    Evidence: .sisyphus/evidence/task-1-grep-clean.txt

  Scenario: Directorio renombrado correctamente
    Tool: Bash (ls + find)
    Preconditions: Rename completado
    Steps:
      1. test ! -d /Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/coin-info-bot && echo "OLD DIR GONE"
      2. test -d /Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/chain-dexter-bot && echo "NEW DIR EXISTS"
      3. find /Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/chain-dexter-bot/ -name "*.ts" | wc -l → assert >= 5
    Expected Result: OLD DIR GONE, NEW DIR EXISTS, 5+ .ts files
    Evidence: .sisyphus/evidence/task-1-directories.txt

  Scenario: Build limpio post-rename
    Tool: Bash
    Preconditions: Rename completado
    Steps:
      1. cd /Users/bryanstevens/dev/onchain-bot/apps/backend && npm run build
      2. assert exit code == 0
      3. cd /Users/bryanstevens/dev/onchain-bot/apps/backend && npm test 2>&1 | tail -10
    Expected Result: Build OK, tests 306 passing
    Evidence: .sisyphus/evidence/task-1-build-tests.txt

  Scenario: Lint limpio post-rename
    Tool: Bash
    Preconditions: Rename completado
    Steps:
      1. cd /Users/bryanstevens/dev/onchain-bot/apps/backend && npm run lint
      2. assert exit code == 0
      3. assert no warnings/errors
    Expected Result: 0 errors
    Evidence: .sisyphus/evidence/task-1-lint.txt

  Scenario: Config carga nueva env var
    Tool: Bash
    Preconditions: Rename completado, CHAIN_DEXTER_BOT_TOKEN en .env
    Steps:
      1. cd /Users/bryanstevens/dev/onchain-bot/apps/backend && node -e "
         const cfg = require('./dist/shared/common/config/app.config').appConfig();
         console.log(JSON.stringify(cfg().telegram?.publishing?.chainDexterBot));
         " 2>&1 || (npm run build && node -e "...")
      2. assert output contiene "botToken" (no undefined)
      3. NO debe contener "coinInfoBot" en ningún log
    Expected Result: chainDexterBot.botToken cargado, sin residuos
    Evidence: .sisyphus/evidence/task-1-config-load.txt

  Scenario: Bot arranca con nueva config
    Tool: Bash
    Preconditions: Rename completado, DATABASE_ENABLED=false
    Steps:
      1. cd /Users/bryanstevens/dev/onchain-bot && CHAIN_DEXTER_BOT_TOKEN=test CHAIN_DEXTER_INGEST_MODE=polling npm run dev:backend 2>&1 | head -30 &
      2. sleep 5
      3. curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/chain-dexter/health || true
      4. assert response o log no contiene "coinInfoBot" ni "coin-info-bot"
      5. kill backend process
    Expected Result: Sin referencias residuales en runtime
    Evidence: .sisyphus/evidence/task-1-bot-starts.txt

  Scenario: Tokens ortogonales NO modificados
    Tool: Bash (grep)
    Preconditions: Rename completado
    Steps:
      1. grep -n "VIP_CALLS_BOT_TOKEN\|PUBLISHING_TELEGRAM_BOT_TOKEN\|TELEGRAM_BOT_TOKEN\|TELEGRAM_MTPROTO" /Users/bryanstevens/dev/onchain-bot/apps/backend/.env
      2. assert esas líneas siguen presentes sin cambios
    Expected Result: Otros bots intactos
    Evidence: .sisyphus/evidence/task-1-orthogonal-bots.txt
  ```

  **Commit**: YES (solo este commit, atómico)
  - Message: `refactor(telegram): rename coin-info-bot → chain-dexter-bot`
  - Files: 7 archivos del directorio renombrado + `app.module.ts` + `app.config.ts` + `.env` + `.env.example` (raíz)
  - Pre-commit: `npm run lint && npm test` + `grep` verification de cero residuos
  - Post-commit: verificar `git show --stat HEAD` muestra solo archivos esperados

---

### Wave 1 — Foundations (5 tasks paralelas)

- [ ] 2. **Bot config + env vars**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/bot.config.ts` con shape:
    ```ts
    interface ChainDexterBotConfig {
      botToken: string;
      webhookSecret: string | null;
      ingestMode: 'webhook' | 'polling';
      pollingIntervalMs: number;     // default 1000
      pollingTimeoutSec: number;     // default 30
      defaultTradeButtons: TradeButtonCode[]; // ['DEX','PHO','TRO']
      maxMessageLength: number;      // 4096
      commandRateLimitPerUser: number; // 30/min, default
    }
    ```
  - Registrar en `app.config.ts` con key `chainDexterBot`
  - Añadir env vars a `.env.example`:
    ```
    CHAIN_DEXTER_BOT_TOKEN=
    CHAIN_DEXTER_WEBHOOK_SECRET=
    CHAIN_DEXTER_INGEST_MODE=webhook
    CHAIN_DEXTER_POLLING_INTERVAL_MS=1000
    CHAIN_DEXTER_DEFAULT_TRADE_BUTTONS=DEX,PHO,TRO
    ```
  - Validar config al boot: warning si `botToken` vacío, error si `ingestMode=webhook` y `webhookSecret` vacío
  - Exportar `ChainDexterBotConfigService` para acceder vía DI

  **Must NOT do**:
  - NO añadir secrets hardcoded
  - NO leer de `process.env` directamente fuera de `app.config.ts`
  - NO crear config para los BCs ya existentes (ellos ya tienen su config)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config wiring, no business logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con T3, T4, T5, T6)
  - **Blocks**: T12, T14-T19
  - **Blocked By**: T1

  **References**:
  - **Pattern References**:
    - `apps/backend/src/shared/common/config/app.config.ts` — patrón de config loading (sigue este estilo)
    - `apps/backend/src/shared/common/persistence/database.module.ts:1-50` — patrón de validación al boot con warnings
  - **Test References**:
    - `apps/backend/src/shared/common/config/app.config.spec.ts` si existe — estilo de tests de config

  **Acceptance Criteria**:
  - [ ] Archivo `apps/backend/src/telegram/chain-dexter-bot/bot.config.ts` creado
  - [ ] `CHAIN_DEXTER_BOT_TOKEN` reconocido en env
  - [ ] `app.config.ts` carga key `chainDexterBot`
  - [ ] `.env.example` actualizado con 4 nuevas vars
  - [ ] Backend arranca con warning si `botToken` vacío
  - [ ] Backend falla al boot si `ingestMode=webhook` sin `webhookSecret`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Config carga con env completo
    Tool: Bash
    Preconditions: .env con CHAIN_DEXTER_BOT_TOKEN=test123
    Steps:
      1. CHAIN_DEXTER_BOT_TOKEN=test123 CHAIN_DEXTER_INGEST_MODE=polling npm run dev:backend &
      2. sleep 4
      3. curl -s http://localhost:3030/chain-dexter/health (asumiendo T3 ya en sitio) o grep logs
      4. kill backend
    Expected Result: Backend arranca sin warnings de config
    Evidence: .sisyphus/evidence/task-2-config-loaded.txt

  Scenario: Warning cuando bot token vacío
    Tool: Bash
    Preconditions: CHAIN_DEXTER_BOT_TOKEN no exportado
    Steps:
      1. unset CHAIN_DEXTER_BOT_TOKEN
      2. CHAIN_DEXTER_INGEST_MODE=polling npm run dev:backend 2>&1 | head -20
      3. assert logs contain "CHAIN_DEXTER_BOT_TOKEN not configured"
    Expected Result: Warning visible en logs, app sigue arrancando
    Evidence: .sisyphus/evidence/task-2-warning-empty.txt

  Scenario: Error cuando webhook sin secret
    Tool: Bash
    Preconditions: CHAIN_DEXTER_BOT_TOKEN=test, ingestMode=webhook, no secret
    Steps:
      1. CHAIN_DEXTER_BOT_TOKEN=test CHAIN_DEXTER_INGEST_MODE=webhook npm run dev:backend 2>&1 | head -20
      2. assert logs contain error o exit no-cero
    Expected Result: App falla con mensaje claro
    Evidence: .sisyphus/evidence/task-2-error-webhook-no-secret.txt
  ```

  **Commit**: YES (Wave 1 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/bot.config.ts`, `apps/backend/src/shared/common/config/app.config.ts`, `.env.example`

---

- [ ] 3. **Telegram Bot API HTTP client (typed)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/bot-client.ts`
  - Clase `TelegramBotClient` con métodos:
    - `sendMessage(chatId, text, options?)` → `{ ok, messageId, error }`
    - `editMessageText(chatId, messageId, text, options?)` → `{ ok, error }`
    - `answerCallbackQuery(callbackQueryId, text?)` → `{ ok, error }`
    - `getUpdates(offset, timeoutSec, allowedUpdates?)` → `TelegramUpdate[]`
    - `setWebhook(url, secretToken?)` → `{ ok, error }`
    - `deleteWebhook()` → `{ ok, error }`
  - Tipar respuestas con interfaces `TelegramUpdate`, `TelegramMessage`, `TelegramCallbackQuery`, `TelegramUser`, `TelegramChat`
  - Usar `HttpService` de `@nestjs/axios` (ya disponible vía HttpModule)
  - Base URL: `https://api.telegram.org/bot{TOKEN}/`
  - Logging estructurado de cada request con duración y status
  - Inyectar `ChainDexterBotConfigService` para token

  **Must NOT do**:
  - NO usar `fetch` nativo (mantener consistencia con HttpService del proyecto)
  - NO re-implementar retry/backoff (eso es wave futura de alerts)
  - NO tipar con `any` — usar interfaces explícitas

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: HTTP client tipado, sin lógica de negocio
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con T2, T4, T5, T6)
  - **Blocks**: T10, T11, T14-T19
  - **Blocked By**: T1, T2

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/coin-info-bot/infrastructure/listeners/coin-info-listener.adapter.ts:78-124` — método `sendMessage` actual (referencia a REEMPLAZAR con client tipado)
  - **External References**:
    - https://core.telegram.org/bots/api — referencia oficial API Telegram Bot (sendMessage, editMessageText, answerCallbackQuery, getUpdates, setWebhook)

  **Acceptance Criteria**:
  - [ ] Archivo `bot-client.ts` exporta clase `TelegramBotClient`
  - [ ] 6 métodos públicos implementados y tipados
  - [ ] Cada método retorna `{ ok: boolean, ... }` con shape consistente
  - [ ] Compilación sin `any` o `@ts-ignore`
  - [ ] Provider registrado en `ChainDexterBotModule`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: sendMessage con bot token mock (servidor http local)
    Tool: Bash (node + http)
    Preconditions: Mock server que captura requests
    Steps:
      1. Iniciar mock server en localhost:9999 que responde a POST /bottest/sendMessage con {ok:true, result:{message_id:1}}
      2. Crear test script que inyecta cliente apuntando al mock
      3. Llamar client.sendMessage(123, "hello")
      4. assert client retorna {ok:true, messageId:1}
      5. assert mock recibió {chat_id:123, text:"hello"}
    Expected Result: Request capturado correctamente, response parseado
    Evidence: .sisyphus/evidence/task-3-sendmessage-mock.txt

  Scenario: sendMessage con error de Telegram
    Tool: Bash (node + http)
    Preconditions: Mock server que responde 400 con {ok:false, description:"Bad Request"}
    Steps:
      1. Mock server con error response
      2. Llamar client.sendMessage
      3. assert client retorna {ok:false, error:"Bad Request"}
    Expected Result: Error capturado y tipado
    Evidence: .sisyphus/evidence/task-3-sendmessage-error.txt
  ```

  **Commit**: YES (Wave 1 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/bot-client.ts`

---

- [ ] 4. **Trade buttons registry (8 plataformas)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/trade-button-registry.ts`
  - Tipo `TradeButtonCode` con union de strings: `'AXI'|'PHO'|'TRO'|'TRT'|'JUP'|'MAE'|'BAN'|'DEX'|'BM'|'DEF'|'DT'`
  - Interface `TradeButton { code: TradeButtonCode; label: string; urlTemplate: string; chains: ChainId[] }`
  - Registry con mínimo 8 plataformas (3 trading + 5 analysis):
    - **DEX** (DexScreener): `https://dexscreener.com/{chain}/{address}` — todos los chains
    - **PHO** (Photon): `https://photon-sol.tinyastro.io/@chaindexter?token={address}` — solo solana
    - **TRO** (Trojan): `https://t.me/solana_trojanbot?start=r-chaindexter-{address}` — solo solana
    - **AXI** (Axiom): `https://axiom.trade/@chaindexter/{chain}/{address}` — solana
    - **JUP** (Jupiter): `https://jup.ag/swap/SOL-{address}` — solana
    - **MAE** (Maestro): `https://t.me/maestro?start=r-chaindexter&token={address}` — evm
    - **BAN** (BananaGun): `https://t.me/BananaGunSniper_bot?start=ref_chaindexter-{address}` — evm
    - **BM** (BubbleMaps): `https://bubblemaps.io/map?address={address}&chain={chain}` — eth, base, sol, bsc
  - Métodos públicos:
    - `getButtonsForChain(chain: ChainId, enabledCodes: TradeButtonCode[]): TradeButton[]`
    - `resolveUrl(code: TradeButtonCode, chain: ChainId, address: string): string`
  - Cargar desde config `CHAIN_DEXTER_DEFAULT_TRADE_BUTTONS` con fallback a `['DEX','PHO','TRO']`

  **Must NOT do**:
  - NO hardcodear URLs de affiliate (usar `CHAIN_DEXTER_AFFILIATE_TAG` si se quiere, pero para MVP usar literal "chaindexter")
  - NO incluir plataformas que no soporten el chain actual (filtrar en `getButtonsForChain`)
  - NO añadir 20+ plataformas (eso es iteración futura) — MVP solo 8

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Registry estático, sin lógica dinámica
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con T2, T3, T5, T6)
  - **Blocks**: T6, T14, T16, T18
  - **Blocked By**: T1

  **References**:
  - **External References**:
    - `docs/rick-bot/14-features-trade-buttons.md:33-72` — referencia de plataformas Rick (estructura de tabla, no copiar URLs literales — las nuestras son chain-dexter-branded)

  **Acceptance Criteria**:
  - [ ] Archivo `trade-button-registry.ts` exporta `TradeButtonRegistry`
  - [ ] 8 botones registrados con URL templates parametrizados
  - [ ] `getButtonsForChain('solana', ['DEX','PHO','TRO'])` retorna 3 botones con URLs resueltas
  - [ ] `getButtonsForChain('ethereum', ['DEX','PHO','TRO'])` retorna solo DEX (PHO/TRO no soportan ethereum)
  - [ ] `TradeButtonCode` type exportado y usado en toda la app

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Registry retorna botones correctos para Solana
    Tool: Bash (node script)
    Preconditions: Registry cargado
    Steps:
      1. node -e "const r = require('./dist/.../trade-button-registry').TradeButtonRegistry; const c = new r([\"DEX\",\"PHO\",\"TRO\"]); console.log(JSON.stringify(c.getButtonsForChain('solana', ['DEX','PHO','TRO']), null, 2))"
      2. assert output tiene 3 botones
      3. assert primer botón es DEX con URL conteniendo {chain}/{address}
    Expected Result: 3 botones con URLs formadas correctamente
    Evidence: .sisyphus/evidence/task-4-registry-solana.json

  Scenario: Registry filtra botones incompatibles con chain
    Tool: Bash (node script)
    Preconditions: Registry cargado
    Steps:
      1. node -e "const r = ...; const c = new r([\"DEX\",\"PHO\",\"TRO\"]); console.log(c.getButtonsForChain('ethereum', ['DEX','PHO','TRO']).length)"
      2. assert output es 1 (solo DEX, no PHO ni TRO)
    Expected Result: Solo chain-compatible buttons
    Evidence: .sisyphus/evidence/task-4-registry-filtered.json

  Scenario: resolveUrl reemplaza placeholders correctamente
    Tool: Bash (node script)
    Preconditions: Registry cargado
    Steps:
      1. node -e "const r = ...; const c = new r(['DEX']); console.log(c.resolveUrl('DEX', 'solana', 'So11111111111111111111111111111111111111111'))"
      2. assert output contiene "solana" y "So11111111"
    Expected Result: URL con chain y address reales
    Evidence: .sisyphus/evidence/task-4-resolve-url.txt
  ```

  **Commit**: YES (Wave 1 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/trade-button-registry.ts`

---

- [ ] 5. **Markdown message formatter (safe escape + 4096 limit)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/message-formatter.service.ts`
  - Reemplazar el actual `MessageFormatterAdapter` con uno mejorado
  - Métodos públicos:
    - `formatTokenScan(scan: TokenScanResult, options: { compact?: boolean, withChart?: boolean }): { text: string; entities: TextEntity[] }`
    - `escapeMarkdown(text: string): string` — escapa `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!` para MarkdownV2 (si se usa) o `*`, `_`, `` ` ``, `[` para HTML/Markdown legacy
    - `truncate(text: string, maxLength: number = 4096): string` — corta sin romper palabras, añade "…"
  - Mantener formato similar al actual pero:
    - **NO** emojis decorativos nuevos (usar solo `💊` para token card como Rick)
    - Datos primero, formato después
    - Spacing limpio con `├`, `│`, `└`, `─`
  - Devolver `{ text, entities }` para que T6 (keyboard builder) pueda añadir inline_keyboard

  **Must NOT do**:
  - NO añadir HTML markup (mantener Markdown/legacy que es el default Telegram)
  - NO usar emojis custom (solo unicode)
  - NO romper el contrato del formatter actual sin migración — si cambia, actualizar todos los call sites
  - NO añadir i18n (todo en español para MVP)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Formatter puro, sin estado
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con T2, T3, T4, T6)
  - **Blocks**: T14-T19
  - **Blocked By**: T1

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/coin-info-bot/infrastructure/formatters/coin-info-formatter.adapter.ts:1-68` — formatter actual a MEJORAR (mismo output style, mejor estructura)
  - **External References**:
    - https://core.telegram.org/bots/api#markdownv2-style — MarkdownV2 reserved chars

  **Acceptance Criteria**:
  - [ ] `formatTokenScan(scan, { compact: false })` retorna texto < 4096 chars
  - [ ] `formatTokenScan(scan, { compact: true })` retorna texto < 1024 chars
  - [ ] `escapeMarkdown("hello_world.test")` retorna `"hello\\_world\\.test"`
  - [ ] `truncate("a".repeat(5000))` retorna string de 4096 chars máximo con "…" al final
  - [ ] Output incluye campos: symbol, name, MC, FDV, price, priceChange, liq, vol, holders, top10
  - [ ] Tests existentes (si los hay) siguen pasando

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Format full scan con datos reales
    Tool: Bash (node script con datos fake)
    Preconditions: Mock TokenScanResult con todos los campos
    Steps:
      1. Crear scan fixture con SOL/USDC, MC=$1M, FDV=$2M, etc.
      2. Llamar formatter.formatTokenScan(scan, {compact: false})
      3. assert output incluye "💊", "MC:", "FDV:", "LIQ:", "HOLDERS:"
      4. assert output length < 4096
    Expected Result: Texto formateado correctamente con datos
    Evidence: .sisyphus/evidence/task-5-format-full.txt

  Scenario: Format compact scan
    Tool: Bash (node script)
    Preconditions: Mismo scan fixture
    Steps:
      1. Llamar formatter.formatTokenScan(scan, {compact: true})
      2. assert output length < 1024
      3. assert output incluye symbol + price + MC solamente
    Expected Result: Versión compacta del scan
    Evidence: .sisyphus/evidence/task-5-format-compact.txt

  Scenario: Escape de caracteres Markdown
    Tool: Bash (node script)
    Preconditions: formatter cargado
    Steps:
      1. formatter.escapeMarkdown("hello_world.test") === "hello\\_world\\.test"
      2. formatter.escapeMarkdown("BTC-USDT") === "BTC\\-USDT"
      3. formatter.escapeMarkdown("(test)") === "\\(test\\)"
    Expected Result: Todos los caracteres reservados escapados
    Evidence: .sisyphus/evidence/task-5-escape.txt
  ```

  **Commit**: YES (Wave 1 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/message-formatter.service.ts`

---

- [ ] 6. **Inline keyboard builder (refresh + trade buttons)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/inline-keyboard.builder.ts`
  - Tipo `InlineKeyboardButton = { text: string; url?: string; callback_data?: string }`
  - Métodos públicos:
    - `buildTradeButtonsRow(tradeButtons: ResolvedTradeButton[], maxPerRow: number): InlineKeyboardButton[][]`
      - Distribuye botones en filas de `maxPerRow` (default 3 en Telegram, 4 en Discord — para MVP solo Telegram)
    - `buildRefreshButton(scanId: string): InlineKeyboardButton[]` — `{ text: "🔄 Refresh", callback_data: "refresh:{scanId}" }`
    - `buildScanKeyboard(scanId: string, tradeButtons: ResolvedTradeButton[], maxPerRow: number = 3): InlineKeyboardButton[][]`
      - Primera fila: trade buttons (limitados por `maxPerRow`)
      - Segunda fila: refresh button
    - `buildTradeButtonsConfigKeyboard(enabledCodes: TradeButtonCode[], availableCodes: TradeButtonCode[]): InlineKeyboardButton[][]`
      - Para `/tb` config: cada botón de plataforma con toggle on/off
      - Callback data: `tb:toggle:{code}`
  - Respetar límite de Telegram: 8 filas máximo por keyboard (de sobra para MVP)
  - No añadir paginación (eso es iteración futura)

  **Must NOT do**:
  - NO usar `switch_inline_query` (eso es para bots inline mode)
  - NO añadir más de 8 filas (Telegram limit)
  - NO añadir web_app buttons (eso es Hub integration, iteración futura)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI builder, layout decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con T2, T3, T4, T5)
  - **Blocks**: T14, T16, T18
  - **Blocked By**: T1, T4

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/trade-button-registry.ts` (de T4) — consume `ResolvedTradeButton` type
  - **External References**:
    - https://core.telegram.org/bots/api#inlinekeyboardmarkup — estructura de InlineKeyboardMarkup

  **Acceptance Criteria**:
  - [ ] Archivo `inline-keyboard.builder.ts` exporta `InlineKeyboardBuilder`
  - [ ] `buildScanKeyboard(scanId, [3 buttons], 3)` retorna 2 filas: [btn1,btn2,btn3] y [refresh]
  - [ ] `buildScanKeyboard(scanId, [6 buttons], 3)` retorna 3 filas: 3+3+refresh
  - [ ] `buildTradeButtonsConfigKeyboard` retorna N filas con toggle buttons
  - [ ] Callback data bien formado: `refresh:{scanId}` y `tb:toggle:{code}`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build scan keyboard con 3 botones
    Tool: Bash (node script)
    Preconditions: Builder cargado, 3 botones mock
    Steps:
      1. builder.buildScanKeyboard("scan-123", [btn1, btn2, btn3], 3)
      2. assert output es InlineKeyboardButton[][] con 2 filas
      3. assert primera fila tiene 3 botones
      4. assert segunda fila tiene 1 botón (refresh) con callback_data="refresh:scan-123"
    Expected Result: Keyboard estructurado correctamente
    Evidence: .sisyphus/evidence/task-6-keyboard-3btns.json

  Scenario: Build scan keyboard con 6 botones (overflow)
    Tool: Bash (node script)
    Preconditions: Builder cargado, 6 botones mock
    Steps:
      1. builder.buildScanKeyboard("scan-456", [b1..b6], 3)
      2. assert output tiene 3 filas
      3. assert filas 1 y 2 tienen 3 botones cada una
      4. assert fila 3 tiene solo refresh
    Expected Result: 6 botones distribuidos en 2 filas + refresh
    Evidence: .sisyphus/evidence/task-6-keyboard-overflow.json

  Scenario: Build tb config keyboard con 8 codes
    Tool: Bash (node script)
    Preconditions: Builder cargado, 8 codes
    Steps:
      1. builder.buildTradeButtonsConfigKeyboard([], ['DEX','PHO','TRO','AXI','JUP','MAE','BAN','BM'])
      2. assert output tiene 8+ filas (cada botón toggle en su fila)
      3. assert cada callback_data empieza con "tb:toggle:"
    Expected Result: 8 toggle buttons
    Evidence: .sisyphus/evidence/task-6-tb-config.json
  ```

  **Commit**: YES (Wave 1 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/inline-keyboard.builder.ts`

---

### Wave 2 — Per-chat persistence (3 tasks paralelas)

- [ ] 7. **ChatGroupEntity + repository (TypeORM + in-memory)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/domain/chat-group.entity.ts`
  - Entity `ChatGroupEntity` con TypeORM:
    ```ts
    @Entity('chain_dexter_chat_groups')
    class ChatGroupEntity {
      @PrimaryGeneratedColumn('uuid') id: string;
      @Index({ unique: true }) @Column('bigint') telegramChatId: string;
      @Column('varchar', { length: 32 }) telegramChatType: 'private' | 'group' | 'supergroup' | 'channel';
      @Column('varchar', { length: 255, nullable: true }) title: string | null;
      @Column('varchar', { length: 64, nullable: true }) telegramChatUsername: string | null;
      @CreateDateColumn() createdAt: Date;
      @UpdateDateColumn() lastSeenAt: Date;
    }
    ```
  - Crear port interface `ChatGroupRepository` en `application/ports/chat-group.repository.ts`:
    - `findByTelegramChatId(chatId: string): Promise<ChatGroupEntity | null>`
    - `upsert(input): Promise<ChatGroupEntity>` — get-or-create
    - `touchLastSeen(id: string): Promise<void>`
  - Implementación TypeORM: `infrastructure/persistence/chat-group.typeorm.repository.ts`
  - Implementación in-memory: `infrastructure/repositories/in-memory-chat-group.repository.ts` (LRU cache con max 1000)
  - Factory pattern: `ChatGroupModule` provee `ChatGroupRepository` con useClass condicional según `DATABASE_ENABLED`

  **Must NOT do**:
  - NO añadir campos no necesarios (user tracking, premium, etc. — eso es iteración futura)
  - NO usar auto-migration custom — usar `synchronize: true` del proyecto
  - NO añadir `softDelete` (no se necesita en MVP)
  - NO añadir relaciones con otras entities

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Entity + 2 implementaciones de repo + factory, hexagonal pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (con T8)
  - **Blocks**: T9, T13
  - **Blocked By**: T1

  **References**:
  - **Pattern References**:
    - `apps/backend/src/kol/identity/domain/entities/kol.entity.ts` — patrón de entity TypeORM en este proyecto (sigue estructura)
    - `apps/backend/src/kol/identity/infrastructure/repositories/in-memory-kol.repository.ts` — patrón de repo in-memory
    - `apps/backend/src/kol/identity/infrastructure/persistence/kol.typeorm.repository.ts` — patrón de repo TypeORM
    - `apps/backend/src/shared/common/persistence/database.module.ts` — factory condicional `DATABASE_ENABLED`
  - **API/Type References**:
    - `apps/backend/src/shared/kernel/` — DDD primitives (AggregateRoot, Entity, ValueObject)

  **Acceptance Criteria**:
  - [ ] Entity `ChatGroupEntity` definida con todas las columnas
  - [ ] Tabla `chain_dexter_chat_groups` se auto-crea al boot (con `synchronize: true`)
  - [ ] `ChatGroupRepository` interface exportada en `application/ports/`
  - [ ] Implementación in-memory funcional sin DB
  - [ ] Implementación TypeORM funcional con DB
  - [ ] Factory provee la implementación correcta según `DATABASE_ENABLED`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Upsert crea nuevo grupo en modo in-memory
    Tool: Bash (node script)
    Preconditions: DATABASE_ENABLED=false
    Steps:
      1. Crear ChatGroupEntity fixture { telegramChatId: "12345", telegramChatType: "group", title: "Test Group" }
      2. repo.upsert(fixture) → debe crear y retornar entity con id
      3. repo.findByTelegramChatId("12345") → debe retornar entity creada
      4. repo.upsert(otra vez con mismo chatId) → debe retornar misma entity (no duplicar)
    Expected Result: get-or-create funciona, sin duplicados
    Evidence: .sisyphus/evidence/task-7-upsert-inmemory.txt

  Scenario: Upsert con DATABASE_ENABLED=true (requiere DB)
    Tool: Bash (docker + node)
    Preconditions: docker-compose up postgres, DATABASE_ENABLED=true
    Steps:
      1. npm run docker:up
      2. Esperar postgres ready
      3. DATABASE_ENABLED=true npm run dev:backend &
      4. Crear ChatGroup vía script
      5. Query SELECT * FROM chain_dexter_chat_groups
      6. assert 1 row
      7. Reiniciar backend, repeat query, assert row persiste
    Expected Result: Persistencia real funciona tras restart
    Evidence: .sisyphus/evidence/task-7-persistence.txt

  Scenario: Touch last seen actualiza timestamp
    Tool: Bash (node script)
    Preconditions: Entity existente en repo
    Steps:
      1. Crear entity, leer lastSeenAt = T1
      2. sleep 100ms
      3. repo.touchLastSeen(entity.id)
      4. Leer de nuevo, assert lastSeenAt > T1
    Expected Result: lastSeenAt se actualiza
    Evidence: .sisyphus/evidence/task-7-touch.txt
  ```

  **Commit**: YES (Wave 2 batch)
  - Files: entity, port interface, 2 repo implementations, factory, module

---

- [ ] 8. **ChatSettingsEntity + repository (TypeORM + in-memory)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/domain/chat-settings.entity.ts`
  - Entity `ChatSettingsEntity`:
    ```ts
    @Entity('chain_dexter_chat_settings')
    class ChatSettingsEntity {
      @PrimaryGeneratedColumn('uuid') id: string;
      @Index({ unique: true }) @Column('uuid') chatGroupId: string;
      @Column('simple-array', { default: 'DEX,PHO,TRO' }) enabledTradeButtons: TradeButtonCode[];
      @Column('varchar', { default: 'bot' }) tradeButtonsPosition: 'top' | 'bot';
      @Column('int', { default: 3 }) tradeButtonsLimit: number;
      @Column('boolean', { default: true }) emojimode: boolean;
      @Column('boolean', { default: true }) groupmode: boolean;
      @Column('boolean', { default: true }) autoresponder: boolean;
      @Column('varchar', { default: 'adv' }) pricemode: 'sim' | 'adv';
      @UpdateDateColumn() updatedAt: Date;
    }
    ```
  - Port interface `ChatSettingsRepository`:
    - `findByChatGroupId(chatGroupId: string): Promise<ChatSettingsEntity | null>`
    - `upsert(chatGroupId: string, patch: Partial<ChatSettingsEntity>): Promise<ChatSettingsEntity>`
  - Implementaciones TypeORM + in-memory (igual patrón que T7)
  - Factory pattern con `DATABASE_ENABLED`

  **Must NOT do**:
  - NO añadir relación FK real con ChatGroupEntity (mantener `chatGroupId: string` simple, evita migrations)
  - NO añadir campos no usados en MVP (premium, language, etc.)
  - NO validation complex — defaults razonables al insert

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Entity + 2 implementaciones + factory, mismo patrón que T7
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (con T7)
  - **Blocks**: T9, T18, T19
  - **Blocked By**: T1

  **References**:
  - **Pattern References**: mismos que T7

  **Acceptance Criteria**:
  - [ ] Entity definida con 7 campos configurables + updatedAt
  - [ ] Tabla `chain_dexter_chat_settings` se auto-crea
  - [ ] Defaults se aplican al primer `upsert` (si patch vacío)
  - [ ] Implementaciones TypeORM + in-memory funcionales
  - [ ] Factory provee la implementación correcta

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: First upsert aplica defaults
    Tool: Bash (node script)
    Preconditions: Repo in-memory, no entity previa
    Steps:
      1. repo.upsert('group-1', {}) → debe crear con defaults
      2. assert enabledTradeButtons === ['DEX','PHO','TRO']
      3. assert emojimode === true
      4. assert groupmode === true
    Expected Result: Defaults aplicados
    Evidence: .sisyphus/evidence/task-8-defaults.txt

  Scenario: Patch parcial actualiza solo campos provistos
    Tool: Bash (node script)
    Preconditions: Entity existente
    Steps:
      1. Crear settings con defaults
      2. repo.upsert('group-1', { enabledTradeButtons: ['PHO','AXI','TRO','JUP'], tradeButtonsLimit: 4 })
      3. Leer de nuevo
      4. assert enabledTradeButtons === ['PHO','AXI','TRO','JUP']
      5. assert tradeButtonsLimit === 4
      6. assert emojimode === true (no modificado)
    Expected Result: Patch parcial funciona
    Evidence: .sisyphus/evidence/task-8-partial-update.txt
  ```

  **Commit**: YES (Wave 2 batch)
  - Files: entity, port interface, 2 repo implementations, factory

---

- [ ] 9. **ChatGroupSettingsService (use cases: getOrCreate, update)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/chat-settings.service.ts`
  - Servicio `ChatSettingsService` con métodos:
    - `getOrCreateForChat(telegramChatId, chatType, title?): Promise<{ group: ChatGroupEntity, settings: ChatSettingsEntity }>`
      - Lógica: upsert ChatGroup → upsert ChatSettings con defaults si no existe → retornar ambos
    - `updateSettings(telegramChatId: string, patch: Partial<ChatSettingsEntity>): Promise<ChatSettingsEntity>`
      - Lógica: find group → upsert settings
    - `toggleTradeButton(telegramChatId: string, code: TradeButtonCode): Promise<ChatSettingsEntity>`
      - Lógica: si `code` está enabled → quitar; si no → añadir (respetando `tradeButtonsLimit`)
  - Manejar errores: si telegramChatId no existe → getOrCreate
  - Logging estructurado: `chatId, action, fieldsChanged`

  **Must NOT do**:
  - NO hacer validación de input (eso es capa de comando en Wave 4)
  - NO añadir event publishing (eso es iteración futura de alerts)
  - NO añadir cache layer (TypeORM ya tiene query cache, in-memory es LRU)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Orquestación de 2 repos, lógica de toggle con límite
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depende de T7+T8)
  - **Parallel Group**: Wave 2 (después de T7, T8)
  - **Blocks**: T12, T14, T18, T19
  - **Blocked By**: T7, T8

  **References**:
  - **Pattern References**:
    - `apps/backend/src/kol/identity/application/handlers/kol-lifecycle.use-case.ts` — patrón de use case con logging
    - `apps/backend/src/kol/identity/application/handlers/get-kol.use-case.ts` — patrón de use case con find-or-create

  **Acceptance Criteria**:
  - [ ] 3 métodos públicos implementados
  - [ ] `getOrCreateForChat` para chatId nuevo retorna defaults
  - [ ] `toggleTradeButton` respeta `tradeButtonsLimit` (no añade si ya está al máximo)
  - [ ] Logging estructurado presente

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: getOrCreateForChat con chat nuevo
    Tool: Bash (node script)
    Preconditions: Repos vacíos
    Steps:
      1. service.getOrCreateForChat('99999', 'group', 'Test')
      2. assert retorna {group con id, settings con defaults}
      3. Segunda llamada con mismo chatId retorna misma entity (no duplica)
    Expected Result: get-or-create funciona correctamente
    Evidence: .sisyphus/evidence/task-9-getorcreate.txt

  Scenario: toggleTradeButton añade hasta el límite
    Tool: Bash (node script)
    Preconditions: Settings con tradeButtonsLimit=3, enabledTradeButtons=[]
    Steps:
      1. toggleTradeButton(chatId, 'DEX') → assert enabledTradeButtons=['DEX']
      2. toggleTradeButton(chatId, 'PHO') → assert enabledTradeButtons=['DEX','PHO']
      3. toggleTradeButton(chatId, 'TRO') → assert enabledTradeButtons=['DEX','PHO','TRO']
      4. toggleTradeButton(chatId, 'AXI') → assert enabledTradeButtons=['DEX','PHO','TRO'] (NO añade, al límite)
    Expected Result: Toggle respeta límite
    Evidence: .sisyphus/evidence/task-9-toggle-limit.txt

  Scenario: toggleTradeButton quita si ya estaba
    Tool: Bash (node script)
    Preconditions: Settings con enabledTradeButtons=['DEX','PHO']
    Steps:
      1. toggleTradeButton(chatId, 'DEX') → assert enabledTradeButtons=['PHO']
    Expected Result: Toggle quita si ya estaba
    Evidence: .sisyphus/evidence/task-9-toggle-remove.txt
  ```

  **Commit**: YES (Wave 2 batch)
  - Files: `chat-settings.service.ts`, registrado como provider en `ChainDexterBotModule`

---

### Wave 3 — Bot ingest (4 tasks paralelas)

- [ ] 10. **Webhook controller (POST /chain-dexter/webhook + HMAC)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/api/http/webhook.controller.ts`
  - Controller `ChainDexterWebhookController` con ruta `POST /chain-dexter/webhook`
  - Validar `X-Telegram-Bot-Api-Secret-Token` header contra `CHAIN_DEXTER_WEBHOOK_SECRET` (HMAC, rechaza si no coincide)
  - Aceptar body JSON `TelegramUpdate`, delegar a `CommandRouter` (T12) vía `UpdateDispatcherService` (servicio intermediario)
  - Responder siempre `200 OK` inmediatamente (Telegram reintenta si no respondes < 30s)
  - Logging estructurado: `updateId, chatId, userId, command, latency`
  - Manejar errores sin tirar 5xx: capturar en try/catch, log error, responder 200 igualmente
  - Aplicar rate limiting básico por chatId (max 30 updates/min, configurable en T2)

  **Must NOT do**:
  - NO validar el body schema con class-validator (Telegram ya garantiza el shape; confiamos en tipado)
  - NO hacer retry/backoff dentro del webhook (Telegram lo gestiona)
  - NO usar `Body()` de `@nestjs/common` con DTO — usar `@Req()` raw para tener acceso al body completo

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Controller con HMAC validation + rate limiting, integración con config
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (con T11, T12, T13)
  - **Blocks**: T14-T19
  - **Blocked By**: T1, T2, T3

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/coin-info-bot/api/http/coin-info.controller.ts` — patrón de controller NestJS (referencia a renombrar/reemplazar)
  - **External References**:
    - https://core.telegram.org/bots/api#setwebhook — campos del webhook secret
    - https://core.telegram.org/bots/webhooks — best practices (responder 200 rápido, no bloquear)

  **Acceptance Criteria**:
  - [ ] Controller `ChainDexterWebhookController` con ruta `POST /chain-dexter/webhook`
  - [ ] HMAC validation: rechaza con 401 si header `X-Telegram-Bot-Api-Secret-Token` no coincide
  - [ ] HMAC validation: acepta con 200 si header coincide
  - [ ] Si `CHAIN_DEXTER_WEBHOOK_SECRET` está vacío y `ingestMode=webhook`, log warning al boot (no falla; permite dev sin secret)
  - [ ] Responde 200 incluso si el handler interno falla (no propagation de errores a Telegram)
  - [ ] Rate limit activo: updates > 30/min del mismo chatId → rechazado con 429

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Webhook acepta update válido con HMAC correcto
    Tool: Bash (curl)
    Preconditions: Backend corriendo con CHAIN_DEXTER_INGEST_MODE=webhook + CHAIN_DEXTER_WEBHOOK_SECRET=secret123
    Steps:
      1. curl -X POST http://localhost:3030/chain-dexter/webhook \
           -H "Content-Type: application/json" \
           -H "X-Telegram-Bot-Api-Secret-Token: secret123" \
           -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":123,"type":"private"},"text":"/x So11111111111111111111111111111111111111111"}}'
      2. assert HTTP 200
    Expected Result: Update aceptado, log muestra "webhook received update_id=1"
    Evidence: .sisyphus/evidence/task-10-webhook-valid.txt

  Scenario: Webhook rechaza update sin HMAC correcto
    Tool: Bash (curl)
    Preconditions: Backend con secret configurado
    Steps:
      1. curl -X POST http://localhost:3030/chain-dexter/webhook \
           -H "Content-Type: application/json" \
           -H "X-Telegram-Bot-Api-Secret-Token: wrong-secret" \
           -d '{"update_id":1,"message":{...}}'
      2. assert HTTP 401
    Expected Result: Rechazado por HMAC
    Evidence: .sisyphus/evidence/task-10-webhook-hmac-fail.txt

  Scenario: Rate limit por chat
    Tool: Bash (curl loop)
    Preconditions: Backend con rate limit activo
    Steps:
      1. Loop 35 veces con mismo chatId, secret válido
      2. Contar respuestas != 200
      3. assert >= 5 rechazados (429)
    Expected Result: Rate limit bloquea después de threshold
    Evidence: .sisyphus/evidence/task-10-ratelimit.txt
  ```

  **Commit**: YES (Wave 3 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/api/http/webhook.controller.ts`

---

- [ ] 11. **Update poller (long-polling, configurable interval)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/update-poller.service.ts`
  - Servicio `UpdatePollerService` con método `start()` que arranca un loop en `OnModuleInit`
  - Loop: llamar `TelegramBotClient.getUpdates(offset, timeoutSec, ['message','callback_query'])`, procesar cada update, incrementar offset
  - Intervalo: `CHAIN_DEXTER_POLLING_INTERVAL_MS` (default 1000ms entre polls)
  - Timeout: `long polling 30s` (Telegram espera hasta 30s por updates)
  - Manejo de errores: capturar excepciones, log warning, esperar 5s y reintentar (NO caer)
  - Apagado limpio en `OnModuleDestroy`: cancelar loop activo
  - Solo se activa si `ingestMode=polling` (chequear en `start()`)
  - Re-registra webhook si previamente se había configurado uno (cleanup al arrancar en polling mode)

  **Must NOT do**:
  - NO usar `setInterval` (preferir `setTimeout` recursivo para back-pressure natural)
  - NO guardar `offset` en DB (en memoria está bien para MVP; persistencia es iteración futura)
  - NO usar librerías externas de polling (la API de Telegram es suficiente)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Long-polling service con lifecycle management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (con T10, T12, T13)
  - **Blocks**: T14-T19
  - **Blocked By**: T1, T2, T3

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` — patrón de Telegram Bot API adapter (referencia de cómo se hace HTTP al Bot API)
    - `apps/backend/src/telegram/coin-info-bot/infrastructure/listeners/coin-info-listener.adapter.ts:78-124` — método `sendMessage` actual (referencia)
  - **External References**:
    - https://core.telegram.org/bots/api#getupdates — getUpdates semantics + long polling

  **Acceptance Criteria**:
  - [ ] `UpdatePollerService` arranca en `OnModuleInit` solo si `ingestMode=polling`
  - [ ] Llama `getUpdates` con offset incremental
  - [ ] Procesa updates vía `CommandRouter` (T12)
  - [ ] Si `getUpdates` falla, log warning y reintenta tras 5s
  - [ ] En `OnModuleDestroy`, cancela el loop activo
  - [ ] Si había webhook configurado, lo borra al arrancar

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Poller arranca con ingestMode=polling
    Tool: Bash
    Preconditions: CHAIN_DEXTER_INGEST_MODE=polling, CHAIN_DEXTER_BOT_TOKEN=test
    Steps:
      1. CHAIN_DEXTER_INGEST_MODE=polling CHAIN_DEXTER_BOT_TOKEN=test npm run dev:backend 2>&1 | head -30 &
      2. sleep 4
      3. grep logs for "polling started" o similar
      4. kill backend
    Expected Result: Poller loggea arranque, no crashea
    Evidence: .sisyphus/evidence/task-11-poller-start.txt

  Scenario: Poller NO arranca con ingestMode=webhook
    Tool: Bash
    Preconditions: CHAIN_DEXTER_INGEST_MODE=webhook
    Steps:
      1. CHAIN_DEXTER_INGEST_MODE=webhook CHAIN_DEXTER_BOT_TOKEN=test npm run dev:backend 2>&1 | head -30 &
      2. sleep 4
      3. assert logs NO contienen "polling started"
      4. kill backend
    Expected Result: Poller inactivo
    Evidence: .sisyphus/evidence/task-11-poller-skip.txt

  Scenario: Poller maneja error de getUpdates gracefully
    Tool: Bash
    Preconditions: Poller corriendo, simular error de red
    Steps:
      1. Iniciar poller con token inválido
      2. Esperar 3 errores consecutivos
      3. assert backend sigue corriendo (no crashea)
      4. assert logs contienen retry messages
      5. kill backend
    Expected Result: Errores manejados, no crash
    Evidence: .sisyphus/evidence/task-11-poller-retry.txt
  ```

  **Commit**: YES (Wave 3 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/update-poller.service.ts`

---

- [ ] 12. **Command router (parse `/cmd args` → handler dispatch)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/command-router.service.ts`
  - Servicio `CommandRouterService` con método público `dispatch(update: TelegramUpdate, context: CommandContext): Promise<void>`
  - Parsear el texto del mensaje:
    - Detectar prefijo `/` + comando alfanumérico + espacio + args
    - Soportar menciones tipo `/cmd@bot_username` (Telegram añade el bot username si el comando se envía en grupo)
    - Ignorar mensajes sin `/` (a menos que sea reply a mensaje del bot — fuera de scope MVP)
    - Ignorar mensajes editados (`edited_message`) por ahora
  - Dispatch via mapa estático de handlers:
    ```ts
    private handlers = new Map<string, CommandHandler>([
      ['x', this.xHandler.handle],
      ['z', this.zHandler.handle],
      ['c', this.cHandler.handle],
      ['cc', this.ccHandler.handle],
      ['tb', this.tbHandler.handle],
      ['settings', this.settingsHandler.handle],
      ['start', this.startHandler.handle], // welcome
      ['help', this.helpHandler.handle],   // link a docs
    ]);
    ```
  - Si comando no existe: enviar mensaje "Comando desconocido. Usa /help para ver comandos disponibles."
  - Cada handler es un Injectable que implementa interface `CommandHandler { name: string; handle(args: string[], context: CommandContext): Promise<void> }`
  - Logging: `command, chatId, userId, args, latency, error`

  **Must NOT do**:
  - NO usar regex complejo para parsing (un split por whitespace basta)
  - NO soportar comandos con espacios en el nombre (Telegram no lo permite)
  - NO añadir slash commands dinámicos (eso es iteración futura para premium)
  - NO auto-registrar handlers (registro manual en el constructor)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Dispatcher central con parsing, logging, error handling, interfaz para handlers
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (con T10, T11, T13)
  - **Blocks**: T14-T19
  - **Blocked By**: T1, T2, T3, T9

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/coin-info-bot/infrastructure/listeners/coin-info-listener.adapter.ts:47-76` — lógica actual de detección de CAs (referencia de cómo se procesan updates hoy)
  - **API/Type References**:
    - `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/bot-client.ts` (de T3) — tipo `TelegramUpdate`

  **Acceptance Criteria**:
  - [ ] `CommandRouterService` registrado como provider en `ChainDexterBotModule`
  - [ ] Mapa de 8 comandos registrados: `x, z, c, cc, tb, settings, start, help`
  - [ ] Parsing correcto: `/x So11111...` → `command='x', args=['So11111...']`
  - [ ] Parsing correcto: `/x@chain_dexter_bot So11111...` → `command='x', args=['So11111...']` (ignora mention)
  - [ ] Comando desconocido → mensaje "Comando desconocido"
  - [ ] Logging estructurado presente
  - [ ] Errores en handlers NO caen el router (catch + log)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Parse /x simple
    Tool: Bash (node script)
    Preconditions: Router cargado con mocks de handlers
    Steps:
      1. mock handlers xHandler.handle con spy
      2. router.dispatch({message: {text: "/x So11111111111111111111111111111111111111111", chat:{id:1}}}, context)
      3. assert xHandler.handle fue llamado con args=['So11111111111111111111111111111111111111111']
    Expected Result: Handler correcto dispatched
    Evidence: .sisyphus/evidence/task-12-dispatch-x.txt

  Scenario: Parse /x con mention @bot_username
    Tool: Bash (node script)
    Preconditions: Router cargado
    Steps:
      1. mock handlers
      2. router.dispatch({message: {text: "/x@chain_dexter_bot_addr So11111...", chat:{id:1}}}, context)
      3. assert xHandler.handle llamado con args=['So11111...'], command='x' (sin mention)
    Expected Result: Mention ignorada correctamente
    Evidence: .sisyphus/evidence/task-12-dispatch-mention.txt

  Scenario: Comando desconocido envía fallback message
    Tool: Bash (node script con mock botClient)
    Preconditions: Router cargado, mock botClient
    Steps:
      1. router.dispatch({message: {text: "/foo bar", chat:{id:1}}}, context)
      2. assert botClient.sendMessage fue llamado con text conteniendo "Comando desconocido"
    Expected Result: Fallback message enviado
    Evidence: .sisyphus/evidence/task-12-unknown-command.txt

  Scenario: Error en handler no cae el router
    Tool: Bash (node script)
    Preconditions: Router con handler que lanza excepción
    Steps:
      1. mock handler que tira "boom"
      2. router.dispatch({message: {text: "/x", chat:{id:1}}}, context)
      3. assert router NO throw, log contiene error
    Expected Result: Error manejado gracefully
    Evidence: .sisyphus/evidence/task-12-error-handling.txt
  ```

  **Commit**: YES (Wave 3 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/command-router.service.ts`, interface `command-handler.ts`

---

- [ ] 13. **Context resolver (chat_id → ChatGroup, reply-to resolution)**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/context-resolver.service.ts`
  - Servicio `ContextResolverService` con método `resolve(update: TelegramUpdate): Promise<CommandContext>`
  - `CommandContext` interface:
    ```ts
    interface CommandContext {
      chatGroup: ChatGroupEntity;        // upsert via ChatSettingsService
      chatSettings: ChatSettingsEntity;
      user: { id: number; username?: string; firstName?: string; isBot: boolean };
      chatType: 'private' | 'group' | 'supergroup' | 'channel';
      isAdmin: boolean;                   // para /tb (placeholder: false en MVP)
      replyTo?: { messageId: number; text?: string; from?: TelegramUser };
      args: string[];                     // populated by router
    }
    ```
  - Usar `ChatSettingsService.getOrCreateForChat()` para resolver `chatGroup + chatSettings`
  - Touch lastSeen en cada update
  - Logging: `chatId, chatType, isNew`

  **Must NOT do**:
  - NO resolver admin status vía API Telegram (placeholder `false`; MVP no tiene `/tb` lock por admin en DM/groups pequeños)
  - NO persistir user entity (eso es iteración futura con credits/reputation)
  - NO añadir user al chatGroup (Rick lo hace para "members", fuera de scope MVP)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Composition sobre entities existentes + Telegram update parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (con T10, T11, T12)
  - **Blocks**: T14-T19
  - **Blocked By**: T1, T7, T9

  **References**:
  - **API/Type References**:
    - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/chat-settings.service.ts` (de T9) — `getOrCreateForChat`
    - `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/bot-client.ts` (de T3) — tipo `TelegramUpdate`
    - Telegram Bot API: `message.from`, `message.chat`, `message.reply_to_message`

  **Acceptance Criteria**:
  - [ ] `ContextResolverService.resolve(update)` retorna `CommandContext` completo
  - [ ] Chat nuevo → crea ChatGroup + ChatSettings con defaults
  - [ ] Chat existente → reusa entities, actualiza lastSeen
  - [ ] user extraído de `update.message.from`
  - [ ] replyTo extraído de `update.message.reply_to_message` (si existe)
  - [ ] `isAdmin` siempre `false` en MVP (placeholder documentado)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Resolve context para chat nuevo
    Tool: Bash (node script)
    Preconditions: Repos vacíos
    Steps:
      1. resolver.resolve({message: {chat:{id:999,type:'group',title:'Test'}, from:{id:1,first_name:'Alice'}, text:'/x ...'}})
      2. assert retorna CommandContext con chatGroup recién creado, chatSettings con defaults
      3. assert chatGroup.telegramChatId === 999
      4. assert chatSettings.enabledTradeButtons === ['DEX','PHO','TRO']
    Expected Result: Context creado con defaults
    Evidence: .sisyphus/evidence/task-13-new-chat.txt

  Scenario: Resolve context para chat existente (re-uso)
    Tool: Bash (node script)
    Preconditions: Chat 999 ya existe
    Steps:
      1. Primera llamada: create
      2. Segunda llamada: resolve mismo chatId
      3. assert MISMO chatGroup.id (no duplica)
      4. assert lastSeenAt actualizado
    Expected Result: Re-uso sin duplicar
    Evidence: .sisyphus/evidence/task-13-existing-chat.txt

  Scenario: Reply-to context extraction
    Tool: Bash (node script)
    Preconditions: update con reply_to_message
    Steps:
      1. resolver.resolve({message: {..., reply_to_message: {message_id:42, text:'orig', from:{id:2}}}})
      2. assert context.replyTo.messageId === 42
      3. assert context.replyTo.text === 'orig'
    Expected Result: replyTo correctamente extraído
    Evidence: .sisyphus/evidence/task-13-replyto.txt
  ```

  **Commit**: YES (Wave 3 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/context-resolver.service.ts`

---

### Wave 4 — Commands (6 tasks paralelas)

- [ ] 14. **/x command — full scan pipeline + inline keyboard**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/x-token-scan.handler.ts`
  - Clase `XTokenScanHandler implements CommandHandler` con `name='x'`
  - Pipeline de scan:
    1. `args[0]` debe ser token (CA o ticker). Si vacío → enviar "Uso: /x <token-o-CA>"
    2. Resolver ticker → CA usando chain-detection si es CA, o DexScreener search si es ticker (MVP: solo aceptar CAs, devolver error si es ticker sin CA)
    3. Ejecutar `DetectChainUseCase.execute({address})` → chain
    4. Si chain desconocido → enviar "No se pudo detectar la cadena para {address}"
    5. Ejecutar `EnrichTokenUseCase.execute({chain, address})` → snapshot
    6. Si snapshot null → enviar "No se encontraron datos para {address}"
    7. Construir `TokenScanResult` con score/classification/honeypot placeholders (MVP: NO invocar classify/score/honeypot, dejar campos null — solo enrich; invocarlos es iteración futura)
    8. Renderizar mensaje con `MessageFormatterService.formatTokenScan(result, {compact: false})`
    9. Construir inline keyboard con `InlineKeyboardBuilder.buildScanKeyboard(scanId, tradeButtons, maxPerRow=chatSettings.tradeButtonsLimit)`
    10. Resolver trade buttons usando `TradeButtonRegistry.getButtonsForChain(chain, chatSettings.enabledTradeButtons)`
    11. Enviar mensaje vía `TelegramBotClient.sendMessage(chatId, text, { reply_markup: keyboard })`
  - Limitar a 1 scan activo por usuario (rate limit natural; 30/min ya aplicado en T10)
  - Logging: `chatId, userId, chain, address, latency`

  **Must NOT do**:
  - NO invocar `ClassifyTokenUseCase` / `ScoreTokenUseCase` / `AnalyzeTokenHoneypotUseCase` (eso es iteración futura, marcado como "killer feature")
  - NO soportar tickers (solo CAs por ahora)
  - NO enviar mensaje de loading (Telegram no lo soporta nativamente)
  - NO cachear resultados (cada /x hace scan fresco)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Orquestación de 5 BCs existentes + formatter + keyboard builder + bot client
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (con T15, T16, T17, T18, T19)
  - **Blocks**: F1-F4
  - **Blocked By**: T2-T6, T9, T12, T13

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/coin-info-bot/application/coin-info.service.ts:67-116` — pipeline actual de `getTokenInfo` (referencia directa de qué invocar)
    - `apps/backend/src/chain/detection/application/handlers/detect-chain.use-case.ts` — uso de `DetectChainUseCase`
    - `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts` — uso de `EnrichTokenUseCase`
    - `apps/backend/src/chain/explorer/application/ports/token-snapshot.repository.ts` — acceso a snapshots históricos (futuro uso)

  **Acceptance Criteria**:
  - [ ] Handler `XTokenScanHandler` registrado en router con name='x'
  - [ ] `/x So11111111111111111111111111111111111111111` (SOL CA) retorna scan completo con keyboard
  - [ ] `/x <empty>` retorna mensaje de uso
  - [ ] `/x <unknown-ca>` retorna "No se pudo detectar la cadena"
  - [ ] `/x 0x...` (ETH CA) funciona y muestra DEX button
  - [ ] Inline keyboard incluye trade buttons filtrados por chain + refresh button
  - [ ] Mensaje respeta 4096 char limit (truncado si es necesario)
  - [ ] Latencia < 5s en CA conocido

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /x con CA de Solana válido
    Tool: Bash (curl al webhook con mock del bot API)
    Preconditions: Backend corriendo, mock Telegram API captura sendMessage
    Steps:
      1. POST /chain-dexter/webhook con update {message:{text:'/x So11111111111111111111111111111111111111111', chat:{id:1,type:'private'}, from:{id:1}}}
      2. Esperar 3s
      3. Verificar mock capturó sendMessage con text conteniendo 'SOL', 'MC:', 'LIQ:'
      4. Verificar mock capturó inline_keyboard con al menos 1 botón URL + 1 callback_data 'refresh:...'
    Expected Result: Scan completo con inline keyboard
    Evidence: .sisyphus/evidence/task-14-scan-sol.txt

  Scenario: /x con CA inválido (no se detecta chain)
    Tool: Bash (curl)
    Preconditions: Backend corriendo
    Steps:
      1. POST /chain-dexter/webhook con update {message:{text:'/x invalidchainxxx999', ...}}
      2. Verificar mock capturó mensaje "No se pudo detectar la cadena"
    Expected Result: Error graceful
    Evidence: .sisyphus/evidence/task-14-chain-unknown.txt

  Scenario: /x sin args
    Tool: Bash (curl)
    Preconditions: Backend corriendo
    Steps:
      1. POST /chain-dexter/webhook con update {message:{text:'/x', ...}}
      2. Verificar mock capturó mensaje "Uso: /x <token-o-CA>"
    Expected Result: Usage message
    Evidence: .sisyphus/evidence/task-14-no-args.txt

  Scenario: /x con EVM CA (ETH)
    Tool: Bash (curl)
    Preconditions: Backend corriendo
    Steps:
      1. POST /chain-dexter/webhook con update {message:{text:'/x 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', ...}}  // USDC mainnet
      2. Verificar mock capturó scan con chain='ethereum'
      3. Verificar inline_keyboard incluye botón DEX (no PHO/TRO)
    Expected Result: Scan multi-chain funciona, keyboard filtra por chain
    Evidence: .sisyphus/evidence/task-14-scan-eth.txt
  ```

  **Commit**: YES (Wave 4 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/x-token-scan.handler.ts`

---

- [ ] 15. **/z command — compact scan**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/z-compact-scan.handler.ts`
  - Clase `ZCompactScanHandler implements CommandHandler` con `name='z'`
  - Mismo pipeline que `/x` (T14) pero usando `MessageFormatterService.formatTokenScan(result, {compact: true})`
  - Sin inline keyboard (solo texto)
  - Sin refresh button (el usuario puede re-enviar `/z <CA>`)

  **Must NOT do**:
  - NO re-implementar pipeline — delegar a un `TokenScanPipeline.execute(address)` compartido (extraer de T14)
  - NO añadir campos extra al output compact (solo symbol, price, MC, FDV, holders)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Variante de T14, sin lógica nueva
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (con T14, T16, T17, T18, T19)
  - **Blocks**: F1-F4
  - **Blocked By**: T2-T6, T9, T12, T13, T14

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/x-token-scan.handler.ts` (de T14) — extraer pipeline compartido

  **Acceptance Criteria**:
  - [ ] Handler `ZCompactScanHandler` registrado con name='z'
  - [ ] `/z So11111111...` retorna scan compact < 1024 chars
  - [ ] Sin inline keyboard en respuesta
  - [ ] Mismas validaciones que `/x` (chain detection, snapshot null)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /z con CA válido retorna compact
    Tool: Bash (curl)
    Preconditions: Backend corriendo
    Steps:
      1. POST /chain-dexter/webhook con /z So11111...
      2. Verificar mock capturó sendMessage con text < 1024 chars
      3. Verificar NO incluye inline_keyboard
    Expected Result: Compact scan sin keyboard
    Evidence: .sisyphus/evidence/task-15-compact.txt

  Scenario: /z con CA inválido
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /z invalidxxx999
      2. Verificar mensaje de error
    Expected Result: Error graceful
    Evidence: .sisyphus/evidence/task-15-error.txt
  ```

  **Commit**: YES (Wave 4 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/z-compact-scan.handler.ts`

---

- [ ] 16. **/c command — scan + chart link**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/c-token-chart.handler.ts`
  - Clase `CTokenChartHandler implements CommandHandler` con `name='c'`
  - Pipeline:
    1. Parse `args[0]` (CA) + opcional `args[1]` (timeframe: `1m|5m|15m|1h|4h|1d|1w`, default `5m`)
    2. Si timeframe inválido → enviar "Timeframe inválido. Usa: 1m, 5m, 15m, 1h, 4h, 1d, 1w"
    3. Ejecutar pipeline de scan (igual que T14)
    4. Construir mensaje: scan compact + línea extra con chart link
    5. Chart link: `https://www.geckoterminal.com/{chain}/pools/{poolAddress}?tf={timeframe}` (si hay poolAddress en snapshot)
    6. Si no hay poolAddress → usar DexScreener link `https://dexscreener.com/{chain}/{address}`
    7. Inline keyboard: solo refresh button + chart button (URL al chart)

  **Must NOT do**:
  - NO generar charts propios (siempre link externo)
  - NO usar Telegram chart embeds (no soportado)
  - NO cachear chart URLs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Variante de /x con chart link + timeframe parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (con T14, T15, T17, T18, T19)
  - **Blocks**: F1-F4
  - **Blocked By**: T2-T6, T9, T12, T13, T14

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/x-token-scan.handler.ts` (de T14) — pipeline base

  **Acceptance Criteria**:
  - [ ] Handler `CTokenChartHandler` registrado con name='c'
  - [ ] `/c So11111... 1h` retorna scan + chart link con timeframe=1h
  - [ ] `/c So11111...` (sin timeframe) usa default 5m
  - [ ] `/c So11111... invalid_tf` retorna "Timeframe inválido"
  - [ ] Inline keyboard incluye chart button (URL) + refresh

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /c con timeframe válido
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /c So11111... 1h
      2. Verificar mock capturó sendMessage con text conteniendo "Chart:" y link de GeckoTerminal/DexScreener
      3. Verificar inline_keyboard incluye button con URL al chart
    Expected Result: Scan + chart link
    Evidence: .sisyphus/evidence/task-16-with-tf.txt

  Scenario: /c sin args
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /c (sin args)
      2. Verificar "Uso: /c <token> [timeframe]"
    Expected Result: Usage message
    Evidence: .sisyphus/evidence/task-16-no-args.txt

  Scenario: /c con timeframe inválido
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /c So11111... bogus
      2. Verificar mensaje "Timeframe inválido. Usa: 1m, 5m, 15m, 1h, 4h, 1d, 1w"
    Expected Result: Timeframe validation
    Evidence: .sisyphus/evidence/task-16-bad-tf.txt
  ```

  **Commit**: YES (Wave 4 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/c-token-chart.handler.ts`

---

- [ ] 17. **/cc command — chart only**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/cc-chart-only.handler.ts`
  - Clase `CcChartOnlyHandler implements CommandHandler` con `name='cc'`
  - Pipeline:
    1. Parse args (igual que /c)
    2. Ejecutar `DetectChainUseCase` + `EnrichTokenUseCase` solo para resolver `chain + address + poolAddress`
    3. Enviar mensaje minimal: solo `💊 <symbol> | <chain>\n\n📈 Chart: <URL>`
    4. Inline keyboard: solo chart button (URL)

  **Must NOT do**:
  - NO incluir market data (eso es /c, /x, /z)
  - NO ejecutar el formatter completo

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Variante minimal de /c
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (con T14, T15, T16, T18, T19)
  - **Blocks**: F1-F4
  - **Blocked By**: T2-T6, T9, T12, T13, T14

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/c-token-chart.handler.ts` (de T16) — compartir parsing

  **Acceptance Criteria**:
  - [ ] Handler `CcChartOnlyHandler` registrado con name='cc'
  - [ ] `/cc So11111...` retorna mensaje minimal con chart link
  - [ ] Sin market data en output

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /cc con CA válido
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /cc So11111...
      2. Verificar mensaje < 200 chars
      3. Verificar contiene "Chart:" y URL
      4. Verificar NO contiene "MC:", "LIQ:" (no market data)
    Expected Result: Chart only
    Evidence: .sisyphus/evidence/task-17-cc.txt
  ```

  **Commit**: YES (Wave 4 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/cc-chart-only.handler.ts`

---

- [ ] 18. **/tb command — config inline keyboard + persistence**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/tb-trade-buttons.handler.ts`
  - Clase `TbTradeButtonsHandler implements CommandHandler` con `name='tb'`
  - Modos:
    1. **`/tb`** (sin args): enviar mensaje "Trade buttons actuales: DEX, PHO, TRO. Usa /tb <CODES> para configurar o /tb off para desactivar." con inline keyboard de toggle (de T6)
    2. **`/tb off`**: actualizar `ChatSettings.enabledTradeButtons = []`
    3. **`/tb on`**: actualizar `enabledTradeButtons = config.defaults` (DEX, PHO, TRO)
    4. **`/tb CODE1 CODE2 ...`**: parsear codes, validar contra registry, llamar `ChatSettingsService.toggleTradeButton` por cada uno (o usar `updateSettings` con array directo)
    5. Callback query de botones inline: `tb:toggle:{CODE}` → toggle CODE en enabledTradeButtons, refrescar mensaje con nuevo keyboard
  - Validación: codes inválidos → "Código(s) inválido(s): <lista>. Disponibles: DEX, PHO, TRO, AXI, JUP, MAE, BAN, BM"
  - Respetar `tradeButtonsLimit` (no permitir más de N codes activos)

  **Must NOT do**:
  - NO guardar config por usuario (es por chat)
  - NO persistir position (`top`/`bot`) en MVP (siempre `bot`, ese setting es iteración futura)
  - NO añadir más plataformas en runtime (registry es estático)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Múltiples modos + callback handling + persistencia
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (con T14, T15, T16, T17, T19)
  - **Blocks**: F1-F4
  - **Blocked By**: T2-T6, T9, T12, T13

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/chat-settings.service.ts` (de T9) — `toggleTradeButton`
    - `apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/trade-button-registry.ts` (de T4) — códigos disponibles

  **Acceptance Criteria**:
  - [ ] Handler `TbTradeButtonsHandler` registrado con name='tb'
  - [ ] `/tb` muestra inline keyboard de toggle
  - [ ] `/tb PHO AXI TRO` actualiza settings y confirma
  - [ ] `/tb off` desactiva todos
  - [ ] `/tb invalid_code` retorna error con lista de disponibles
  - [ ] Callback `tb:toggle:DEX` actualiza settings y refresca mensaje
  - [ ] Respeta `tradeButtonsLimit`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /tb sin args muestra keyboard
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /tb
      2. Verificar mensaje con inline_keyboard (cada button con callback_data "tb:toggle:CODE")
    Expected Result: Keyboard de toggle mostrado
    Evidence: .sisyphus/evidence/task-18-tb-show.txt

  Scenario: /tb PHO AXI TRO configura
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /tb PHO AXI TRO
      2. Verificar mensaje "Trade buttons actualizados: PHO, AXI, TRO"
      3. Verificar DB: chatSettings.enabledTradeButtons === ['PHO','AXI','TRO']
    Expected Result: Configuración persiste
    Evidence: .sisyphus/evidence/task-18-tb-set.txt

  Scenario: /tb invalid_code error
    Tool: Bash (curl)
    Steps:
      1. POST /chain-dexter/webhook con /tb PHO INVALID_CODE
      2. Verificar "Código(s) inválido(s): INVALID_CODE. Disponibles: ..."
    Expected Result: Error con códigos disponibles
    Evidence: .sisyphus/evidence/task-18-tb-invalid.txt

  Scenario: Callback query toggle actualiza settings
    Tool: Bash (curl)
    Preconditions: Chat con enabledTradeButtons=['DEX']
    Steps:
      1. POST /chain-dexter/webhook con callback_query {data:'tb:toggle:PHO'}
      2. Verificar DB: enabledTradeButtons === ['DEX','PHO']
      3. Verificar botClient.answerCallbackQuery fue llamado
    Expected Result: Toggle via callback funciona
    Evidence: .sisyphus/evidence/task-18-callback.txt
  ```

  **Commit**: YES (Wave 4 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/tb-trade-buttons.handler.ts`

---

- [ ] 19. **/settings command — read-only display**

  **What to do**:
  - Crear `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/settings-view.handler.ts`
  - Clase `SettingsViewHandler implements CommandHandler` con `name='settings'`
  - Enviar mensaje formateado con todas las settings actuales del chat:
    ```
    ⚙️ Configuración del chat

    🎯 Trade Buttons: DEX, PHO, TRO (límite: 3)
    📍 Posición: bottom
    😊 Emoji mode: ON
    👥 Group mode: ON
    🤖 Auto-responder: ON
    💰 Price mode: adv
    ```

  **Must NOT do**:
  - NO permitir cambios via /settings (eso es iteración futura con sub-comandos `/settings pricemode sim`)
  - NO añadir más campos (los 6 actuales son MVP)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only display formatter
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (con T14, T15, T16, T17, T18)
  - **Blocks**: F1-F4
  - **Blocked By**: T2-T6, T9, T12, T13

  **References**:
  - **Pattern References**:
    - `apps/backend/src/telegram/chain-dexter-bot/domain/chat-settings.entity.ts` (de T8) — campos disponibles

  **Acceptance Criteria**:
  - [ ] Handler `SettingsViewHandler` registrado con name='settings'
  - [ ] `/settings` muestra los 6 campos actuales del chat
  - [ ] Refleja cambios hechos vía `/tb` (consistency check)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /settings muestra defaults
    Tool: Bash (curl)
    Preconditions: Chat nuevo (defaults aplicados)
    Steps:
      1. POST /chain-dexter/webhook con /settings
      2. Verificar mensaje contiene "Trade Buttons: DEX, PHO, TRO", "Emoji mode: ON", etc.
    Expected Result: Display correcto de defaults
    Evidence: .sisyphus/evidence/task-19-defaults.txt

  Scenario: /settings refleja cambios de /tb
    Tool: Bash (curl)
    Preconditions: Chat con enabledTradeButtons=['PHO','AXI'] (cambiado vía /tb)
    Steps:
      1. POST /chain-dexter/webhook con /settings
      2. Verificar mensaje contiene "Trade Buttons: PHO, AXI"
    Expected Result: Settings refleja cambios
    Evidence: .sisyphus/evidence/task-19-after-tb.txt
  ```

  **Commit**: YES (Wave 4 batch)
  - Files: `apps/backend/src/telegram/chain-dexter-bot/application/handlers/commands/settings-view.handler.ts`

---

## Final Verification Wave (MANDATORY — tras TODAS las tasks)

> 4 review agents en PARALELO. TODOS deben APPROVE. Presentar resultados consolidados al usuario y obtener "okay" explícito antes de completar.
>
> **NO auto-proceder tras verification. Esperar aprobación explícita del usuario antes de marcar trabajo completo.**
> **Nunca marcar F1-F4 como completed antes de obtener user OK.** Rejection o feedback → fix → re-run → presentar de nuevo → esperar OK.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `npm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: `/x` command using trade buttons persisted via `/tb`. Test edge cases: chain detection fails, snapshot null, two CAs in one message, DM vs group. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — todo lo del spec fue construido (no missing), nada fuera del spec fue construido (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1** (Wave 0): `refactor(telegram): rename coin-info-bot → chain-dexter-bot`
  Files: 10 affected files
  - 5 archivos renombrados dentro del directorio (`coin-info-bot.module.ts`, `coin-info.controller.ts`, `coin-info.service.ts`, `coin-info-listener.adapter.ts`, `coin-info-formatter.adapter.ts`)
  - Directorio `coin-info-bot/` → `chain-dexter-bot/`
  - `apps/backend/src/app.module.ts` (1 import)
  - `apps/backend/src/shared/common/config/app.config.ts` (2 ocurrencias: interface + factory)
  - `apps/backend/.env` (1 env var renombrada + 2 comentarios actualizados)
  - `.env.example` (raíz, 5 nuevas env vars de chain-dexter-bot)
  Pre-commit: `npm run lint && npm test` + `grep -ri` verification de cero residuos
- **Commit 2** (Wave 1): `feat(chain-dexter): foundations — bot client, formatter, trade buttons registry, keyboard builder`
- **Commit 3** (Wave 2): `feat(chain-dexter): per-chat persistence — ChatGroup + ChatSettings entities + service`
- **Commit 4** (Wave 3): `feat(chain-dexter): ingest — webhook controller + poller + command router + context resolver`
- **Commit 5** (Wave 4): `feat(chain-dexter): core commands — /x /z /c /cc /tb /settings`

---

## Success Criteria

### Verification Commands

```bash
# Build & lint
npm run build                                          # Expected: exit 0
cd apps/backend && npm run lint                        # Expected: 0 errors

# Tests existentes (deben seguir pasando)
cd apps/backend && npm test                            # Expected: 306 passing

# Renombre exhaustivo verificado (CERO residuos en todo el repo)
grep -r -i "coin-info\|coininfo\|coininfobot\|coin_info" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.sisyphus \
  /Users/bryanstevens/dev/onchain-bot/                  # Expected: empty

# Estructura nueva verificada
ls /Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/chain-dexter-bot/
# Expected: chain-dexter-bot.module.ts, api/, application/, infrastructure/, domain/

# Env vars nuevas presentes
grep "CHAIN_DEXTER_" /Users/bryanstevens/dev/onchain-bot/apps/backend/.env
# Expected: CHAIN_DEXTER_BOT_TOKEN, CHAIN_DEXTER_WEBHOOK_SECRET, CHAIN_DEXTER_INGEST_MODE, CHAIN_DEXTER_POLLING_INTERVAL_MS, CHAIN_DEXTER_DEFAULT_TRADE_BUTTONS

# Bot arranca con webhook
CHAIN_DEXTER_INGEST_MODE=webhook CHAIN_DEXTER_BOT_TOKEN=test npm run dev:backend  # Expected: app boots, webhook controller listening

# Bot arranca con polling
CHAIN_DEXTER_INGEST_MODE=polling CHAIN_DEXTER_BOT_TOKEN=test npm run dev:backend  # Expected: app boots, poller running

# Health endpoint
curl -s http://localhost:3030/chain-dexter/health      # Expected: 200 {"status":"ok"}

# Bots ortogonales intactos
grep "VIP_CALLS_BOT_TOKEN\|PUBLISHING_TELEGRAM_BOT_TOKEN\|TELEGRAM_BOT_TOKEN" /Users/bryanstevens/dev/onchain-bot/apps/backend/.env
# Expected: 3 líneas presentes sin cambios
```

### Final Checklist

- [ ] Todos los "Must Have" presentes
- [ ] Todos los "Must NOT Have" ausentes (grep verifications passed — CERO residuos de "coin-info" en todo el repo)
- [ ] 306 tests existentes siguen pasando
- [ ] Build limpio
- [ ] Lint limpio
- [ ] `apps/backend/.env` tiene `CHAIN_DEXTER_BOT_TOKEN` con el mismo valor que tenía `COIN_INFO_BOT_TOKEN` (NO se regeneró el token)
- [ ] `.env.example` raíz tiene las 5 env vars de chain-dexter-bot documentadas
- [ ] Bots ortogonales intactos: `VIP_CALLS_BOT_TOKEN`, `PUBLISHING_TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MTPROTO_*` no modificados
- [ ] Las 19 tasks de MVP completadas con QA scenarios ejecutados + evidencia
- [ ] Las 4 final reviews (F1-F4) todas APPROVE
- [ ] User OK explícito recibido antes de cerrar trabajo