# dexter-message-templates - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Un sistema de plantillas de mensajes en Markdown para el bot Dexter: varias plantillas por comando (compra, venta, escaneo, etc.) con una sola activa a la vez, marcadores como {{chain}} que se rellenan solos, y emojis automaticos por red (Solana 🟣, Ethereum 🔷...). Incluye reordenar el codigo (telegram/ pasa a llamarse gateway/) y una vista previa que no envia nada.

**Why this approach:** Reutilizamos el molde que ya funciona en feed-publisher (plantillas + vista previa + reglas anti-duplicado) en vez de inventar otro, y guardamos todo en Postgres para que sobreviva a reinicios. Los botones de trading se quedan como enlaces de texto porque el gateway aun no soporta botoneras.

**What it will NOT do:** No toca el backend antiguo ni el gateway; no permite logica condicional dentro de plantillas (para eso se crean N plantillas); no hay plantillas por grupo en esta fase (globales por comando); la vista previa nunca publica nada.

**Effort:** Large - 14 unidades (DB + dominio + APIs + integracion de 6 comandos + rename + docs)
**Risk:** Medium - el rename telegram/→gateway/ toca ~30 ficheros (mitigado con verificacion de cero imports colgados + suite completa); el resto es patron probado
**Decisions to sanity-check:** Postgres en vez de memoria (para no perder plantillas al reiniciar) · marcadores {{doble llave}} en vez de {simple} (consistencia con el repo) · comandos /c y /cc sin botonera (solo enlaces, por limite del gateway) · plantillas solo para ca/x/z/c/cc/bare en v1 (start/help/settings quedan fuera)

Your next move: aprueba para empezar el trabajo, o pide primero la revision de alta precision (doble Momus). Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- `templates/` BC TOP-LEVEL (`src/templates/`, NO anidado en settings/ — agregado global por comando vs prefs por chat, simetria con `placeholders/`, precedente `feed-publisher/src/llm/` top-level): entidad `MessageTemplate` (id uuid, `command: ca|x|z|c|cc|bare`, `name` unico por comando, `bodyMarkdown` MarkdownV2, `isActive` unico por comando via indice parcial, `version`, timestamps) + validators + port + TypeORM orm-entity/mapper/repo + migration + seed idempotente con 1-2 templates por comando + preview seco (`POST /api/dexter/templates/preview`: `templateId XOR draft` + `address`, render-only — vive en templates/ porque es accion sobre el template, precedente `preview-prompt.use-case.ts` dentro de `llm/`; NO es BC propio).
- `placeholders/` BC: `PlaceholderRegistry` (lista blanca por comando: todos los campos `ResolvedToken` incl. `volume24hUsd/lockedLiquidityPercent/burnedPercent/top20HolderPercent/poolAddress` + derivados `chainDisplay/scanLinks/devLine/tradeHint` + `timeframe` solo c/cc) + `TemplateRenderer` (regex `\{\{(\w+)\}\}`, unknown→400 con lista valida, `escapeV2` propiedad del renderer, null→`N/A`/cadena segun campo, `enforceLength` 4096 con truncate en render).
- Display mapping en `templates/` (es config de render, NO pref de chat): `DisplayMap` (`placeholderKey`, `matchValue` case-insensitive, `display`: texto, emoji o ambos) CRUD; `chain=solana/ethereum/base/bsc/arbitrum/polygon/...` con fallback `""` + limpieza de separadores colgantes (`•`/`|`).
- Rename `src/telegram/` → `src/gateway/` con `git mv` + re-point de imports + `DexterModule` sigue single-root + `AGENTS.md` actualizado.
- Integracion handlers: `/ca` `/x` + bare-address → template activo (fallback built-in `formatScanCard` si no hay activo); `/z` → compact template (migracion legacy Markdown→MarkdownV2); `/c` `/cc` → chart templates **solo-texto con links** (keyboard `reply_markup` se abandona por diseño: `SendDto` del gateway no lo soporta).
- APIs: `GET /api/dexter/templates[/:id]`, `POST/PATCH/DELETE` (409 si es activo o ultimo del comando), `POST /api/dexter/templates/:id/activate` (transaccional), `GET /api/dexter/placeholders/:command`, `POST /api/dexter/templates/preview` (seco: `templateId XOR draft` + `address`, nunca publica), `GET/PATCH /api/dexter/display-maps` + CRUD.
- DB wiring Dexter: deps `typeorm`+`pg`, `DatabaseModule` condicional (`DATABASE_ENABLED`), `data-source.ts`, scripts `migration:*`, `DATABASE_URL` unificado a `onchain_bot_dexter[_staging]` (fijar desacuerdo con `.env.example:67` que dice `dexter_db`).
- Precedente vivo OBLIGATORIO: `apps/feed-publisher/src/llm/` (entity `llm/domain/prompt-template.entity.ts`, validators, port, orm-entity `llm/infrastructure/persistence/typeorm/prompt-template.orm-entity.ts`, mapper, `prompt-templates.controller.ts`, `llm-config.controller.ts`, `feed-llm-generator.adapter.ts` render, `preview-prompt.use-case.ts`, `llm-playground.controller.ts`). El backend `crypto-news-publisher/` esta `@deprecated` (redirecciona a feed-publisher) — solo referencia historica, NO copiar de ahi.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO un Nest module por BC (DexterModule single composition-root se mantiene; P3 aprobado).
- NO expresiones/condicionales/bucles en templates (sustitucion nivel-1 + display-mapping; condicionales = N templates).
- NO scoping por chat/grupo en v1 (globales por comando); `emojiMode=false` de chat-settings NO suprime mapping en v1 (documentado, fase 2).
- NO templates para `start/help/settings/tb` en v1 (enum cerrado a `ca|x|z|c|cc|bare`); usage/error strings (`Uso: /ca...`, `No se pudo resolver`, `No veo ningun contrato`, timeframe invalido) quedan hardcodeados.
- NO keyboards `reply_markup` via gateway (abandono documentado hasta gateway todo 7).
- NO tocar `apps/backend/**` (read-only move source `chain-dexter-bot/`), `.kiro/`, ni `apps/telegram-bots-gateway/**` (solo consumir su API); seed se vendoriza DENTRO del repo.
- NO preview que publique/encole (render-only, probado con spec que aserta cero llamadas al bot).
- NO gestion de templates/emojiMaps via chat Telegram en v1 (crear/editar/activar solo por HTTP API; comando admin `/preview` solo-lectura = fase 2 opcional).
- NO `git reset --hard` / `revert --no-commit` / push directo a `master` (governance: rama `feat/*` desde `dev` + PR).
- NO confundir con el `templates` del frontend: el refactor-feed-frontend planea a futuro `content-templates→templates` en `apps/frontend` (plantillas de contenido del feed); este plan crea `src/templates/` en `apps/dexter-onchain-bot` (plantillas de mensajes del bot Telegram). Dominios distintos; el worker lo distingue por nombre de app en AGENTS + CHANGELOG (todo 14).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (`testRegex .*\.spec\.ts$`, `--forceExit`, 30s; `cd apps/dexter-onchain-bot && npm test`). Cada todo implementacion+test en UNO.
- Comandos canonicos: `npx tsc --noEmit -p tsconfig.json` + `npm run build` + `npm test` en `apps/dexter-onchain-bot/`; boot check `DEXTER_PORT=4060 npm run start:dev` + `curl -s localhost:4060/api/health` + route diff vacio tras rename.
- Evidence: .omo/evidence/task-<N>-dexter-message-templates.<ext> (logs jest+tsc+curls por todo; el worker anexa, nunca solo resporte).

## Execution strategy

### Prerrequisito (higiene entre worktrees, verificado 2026-10-01)

- `feat/feed-frontend` (docs-only, fuera de scope dexter) y principal `dev` no tocan los archivos de este plan → sin solapamiento.
- Antes del `$start-work`, en este worktree: `git fetch origin && git merge origin/dev` (protocolo de sync entre worktrees).

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (fundacion, 5 todos): DB wiring → templates domain → templates infra → placeholders core → display-maps. Orden: 1, luego 2-5 en paralelo sobre 1.
- Wave 2 (superficie, 6 todos): APIs templates/placeholders/emoji + preview + seed + integracion ca-x-bare + integracion z-c-cc. Todo 9 (seed) tras 6; 10-11 tras 4+6+9; 7-8 tras 4-5.
- Wave 3 (cierre, 3 todos): rename gateway → wiring final + `/dexter/token` → docs/changelog/evidence.
- Final: F1-F4 en paralelo; todos deben APPROVE.

### Dependency matrix

| Todo                     | Depends on                        | Blocks  | Can parallelize with |
| ------------------------ | --------------------------------- | ------- | -------------------- |
| 1 DB wiring              | —                                 | 2,3,6,9 | —                    |
| 2 Templates domain       | 1 (tipos)                         | 3,6     | 4,5                  |
| 3 Templates infra        | 1,2                               | 6,9     | 4,5                  |
| 4 Placeholders core      | — (puro)                          | 7,10,11 | 2,3,5                |
| 5 Emoji-maps             | — (puro+repo tras 1)              | 8,10,11 | 2,3,4                |
| 6 Templates API          | 2,3                               | 9,10,11 | 7,8                  |
| 7 Preview en templates/  | 2,3,4 (+5)                        | 10,11   | 6,8                  |
| 8 Emoji API              | 5                                 | 10,11   | 6,7                  |
| 9 Seed+migration data    | 3,6                               | 10,11   | 7,8                  |
| 10 Integracion ca/x/bare | 4,6,9 (+5/8)                      | 13      | 11                   |
| 11 Integracion z/c/cc    | 4,6,9 (+5/8)                      | 13      | 10                   |
| 12 Rename gateway        | 10,11 (para no rebasear a ciegas) | 13      | —                    |
| 13 Wiring final+token    | 10,11,12                          | 14      | —                    |
| 14 Docs+changelog        | 13                                | F1-F4   | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. DB wiring Dexter (deps+DatabaseModule+data-source+migrations+compose) con boot verificado
     What to do / Must NOT do: Anadir `typeorm`+`pg` a `apps/dexter-onchain-bot/package.json`; crear `src/shared/database/` (o `src/database/`): `database.module.ts` condicional por `DATABASE_ENABLED` (in-memory cuando false, TypeORM cuando true; dev/test `synchronize:true`, staging/prod `migrationsRun` via scripts); `data-source.ts` (iconos: `apps/feed-publisher` data-source + `apps/backend/src/shared/common/persistence/data-source.ts` historico); scripts `migration:generate/run/revert/show` en package.json; unificar `DATABASE_URL` a `onchain_bot_dexter[_staging]` (actualizar `.env.example:67` que dice `dexter_db` + templates staging/prod); cablear compose dev/staging. NO tocar `apps/backend/**` ni gateway. NO activar TypeORM en prod sin migration probada.
     Parallelization: Wave 1-primero | Blocked by: — | Blocks: 2,3,6,9
     References (executor has NO interview context - be exhaustive): `apps/dexter-onchain-bot/package.json:21-50` (sin typeorm/pg hoy), `apps/dexter-onchain-bot/AGENTS.md:134-154` (ENV INVENTORY: DATABASE_URL/REDIS_URL RESERVED), `apps/dexter-onchain-bot/src/app.module.ts`, `apps/feed-publisher/src/llm/llm.module.ts` (wiring con DB), `apps/feed-publisher` data-source + migration scripts (canon vivos), `apps/dexter-onchain-bot/.env.example` + `.env.staging.template` + `.env.production.template` + `docker-compose.yml` + `docker-compose.staging.yml`.
     Acceptance criteria (agent-executable): `cd apps/dexter-onchain-bot && npm install && npx tsc --noEmit -p tsconfig.json` OK; `npm test` verde (sin regresiones); `DATABASE_ENABLED=true DEXTER_PORT=4060 npm run start:dev` bootea y `curl -s localhost:4060/api/health` → `{status:'ok'}`; `migration:show` ejecuta sin crash (dry-run aceptado si no hay DB).
     QA scenarios (name the exact tool + invocation): happy: `npm test` + boot+healthcheck, Evidence .omo/evidence/task-1-dexter-message-templates.log. failure: `DATABASE_URL` invalida → boot falla con error legible (no cuelgue >120s); `DATABASE_ENABLED=false` → bootea igual en in-memory.
     Commit: Y | chore(dexter-db): wire TypeORM condicional + data-source + migrations
- [x] 2. templates/ dominio: MessageTemplate entity+validators+port con specs
     What to do / Must NOT do: Crear `src/templates/domain/message-template.entity.ts` (AggregateRoot o Entity pura del kernel local si existe; si dexter no tiene kernel propio, clase + errores de dominio locales): campos `id:uuid, command:'ca'|'x'|'z'|'c'|'cc'|'bare', name (1-100, unico por comando), bodyMarkdown (1-4000, MarkdownV2), isActive:boolean, version:number>=1, createdAt/updatedAt`; metodos `create/reconstitute/rename/updateBody/activate/deactivate/bumpVersion`; `domain/message-template.validators.ts` (name/body/command); `domain/ports/message-template.repository.ts` (findAll/findByCommand/findById/findActiveByCommand/save/delete). Specs `message-template.entity.spec.ts` (creacion, nombre invalido, body vacio/sobrelargo, comando fuera de enum, activate/deactivate). Copiar SHAPE de `apps/feed-publisher/src/llm/domain/prompt-template.entity.ts` + `prompt-template.validators.ts` (canon vivo; el backend `crypto-news-publisher/.../prompt-template.entity.ts:1-5` esta `@deprecated`, NO copiar de ahi). NO TypeORM aqui (dominio puro). Value imports en inyectados (nunca `import type` en ctor).
     Parallelization: Wave 1 | Blocked by: 1 (solo tipos) | Blocks: 3,6
     References: `apps/feed-publisher/src/llm/domain/prompt-template.entity.ts`, `apps/feed-publisher/src/llm/domain/prompt-template.validators.ts`, `apps/feed-publisher/src/llm/domain/ports/prompt-template.repository.ts`, `apps/dexter-onchain-bot/src/settings/domain/chat-settings.ts` (estilo dominio local, SOLO referencia — templates NO vive en settings/), `apps/dexter-onchain-bot/src/dexter.module.ts:1-50`.
     Acceptance criteria: `npm test -- message-template` verde; 100% ramas de validators cubiertas (nombre/body/comando/version).
     QA scenarios: happy: crear+activar+renombrar via spec, Evidence .omo/evidence/task-2-dexter-message-templates.log. failure: `command:'start'` → error dominio; `body` 4001 chars → error; `name` vacio → error.
     Commit: Y | feat(dexter-templates): dominio MessageTemplate + validators + port
- [x] 3. templates/ infra: orm-entity+mapper+repo TypeORM + migration con specs
     What to do / Must NOT do: Crear `src/templates/infrastructure/persistence/typeorm/message-template.orm-entity.ts` (tabla `dexter_message_templates`, pk uuid, `@Unique(['command','name'])`, indice parcial `UNIQUE(command) WHERE is_active` para un-activo-por-comando, columnas body_markdown text, version int default 1); `mappers/message-template.mapper.ts` (toEntity/toDomain); `repositories/typeorm-message-template.repository.ts` (findAll/findByCommand/findById/findActiveByCommand/save upsert/delete); `in-memory-message-template.repository.ts` (Map + seed vacio, para `DATABASE_ENABLED=false` y tests); migration `17xxxxxxxxxx-CreateDexterMessageTemplates.ts`. Specs: mapper roundtrip + repo TypeORM (o in-memory si sin DB: marcar `describe` condicional) + migracion `migration:show` la lista. Modelo: `apps/feed-publisher/src/llm/infrastructure/persistence/typeorm/prompt-template.orm-entity.ts` + `mappers/prompt-template.mapper.ts`. NO FKs hacia otros BCs.
     Parallelization: Wave 1 | Blocked by: 1,2 | Blocks: 6,9
     References: `apps/feed-publisher/src/llm/infrastructure/persistence/typeorm/prompt-template.orm-entity.ts`, `.../mappers/prompt-template.mapper.ts`, `apps/dexter-onchain-bot/src/settings/infrastructure/repositories/in-memory.repositories.ts` (patron in-memory local, SOLO referencia), `apps/dexter-onchain-bot/src/templates/domain/*` (todo 2).
     Acceptance criteria: `npm test -- message-template` verde; `migration:generate -- -n CreateDexterMessageTemplates` produce diff solo de esta tabla; `migration:run`+`revert` en DB dev OK.
     QA scenarios: happy: save+findActive+delete roundtrip, Evidence .omo/evidence/task-3-dexter-message-templates.log. failure: duplicar `(command,name)` → unique-violation mapeada a error dominio (no 500 crudo); activar 2 del mismo comando concurrente → solo uno gana (indice parcial).
     Commit: Y | feat(dexter-templates): persistencia TypeORM + in-memory + migracion
- [x] 4. placeholders/ core: registry+renderer MarkdownV2 con semantica cerrada y specs
     What to do / Must NOT do: Crear `src/placeholders/domain/placeholder-registry.ts`: `PLACEHOLDERS_BY_COMMAND: Record<Command, string[]>` (base = 22 claves ResolvedToken: `symbol/name/chain/address/priceUsd/priceChange24h/marketCapUsd/fdvUsd/liquidityUsd/lockedLiquidityPercent/burnedPercent/volume24hUsd/holders/top10HolderPercent/top20HolderPercent/totalSupply/circulatingSupply/maxSupply/devPctSupply/devWallets/devLine/poolAddress/source` + derivados `chainDisplay/scanLinks/dexscreenerUrl/geckoterminalUrl/tradeHint` + `timeframe` SOLO c/cc); `src/placeholders/application/template-renderer.service.ts`: `render(body, values)` con regex `/\{\{(\w+)\}\}/g`, unknown→throw `UnknownPlaceholder(key, validList)` (controlador lo vuelve 400), null→`N/A` (numericos) / `""` (derivados opcionales), `devLine` con semantica `formatDevV2` (`message-formatter.ts:130-146`: `Dev N/A` si vacio, top-2 wallets cortas), `chainDisplay` via DisplayMap (inyectado, fallback `""`), escape: EL RENDERER aplica `escapeV2` a cada valor (autor escribe raw; formateadores `formatMoney/Number/Percent` del formatter reutilizados ANTES de escapar, nunca doble-escape), `enforceLength` 4096 con `truncate` (`message-formatter.ts:158-177,220-226`); limpieza de separadores colgantes (`s/\\s*[•|]\\s*([\\n]|$)//` cuando un segmento quedo vacio). Specs: render completo, unknown→error con lista, null→N/A, escapeV2 sin doble-escape (`$` y `.` escapados una vez), truncate 4096 con marker, `timeframe` rechazado fuera de c/cc. NO condicionales/bucles/filtros (throw si `{%`/`{{#`).
     Parallelization: Wave 1 | Blocked by: — | Blocks: 7,10,11
     References: `apps/dexter-onchain-bot/src/scan/domain/ports/scan-pipeline.port.ts:31-54` (ResolvedToken completo), `apps/dexter-onchain-bot/src/scan/infrastructure/formatter/message-formatter.ts:62-177,220-269` (escapeV2/truncate/formatMoney/Number/Percent/dev), `apps/feed-publisher/src/llm/infrastructure/llm/feed-llm-generator.adapter.ts` (render precedente vivo), `apps/dexter-onchain-bot/src/commands/application/handlers/c-token-chart.handler.ts:9` (VALID_TIMEFRAMES para {{timeframe}}).
     Acceptance criteria: `npm test -- placeholder` verde; matriz: 22 claves base + 5 derivados + timeframe-solo-c/cc; fuzz de 50 bodies con `{{desconocido}}` → error con lista valida.
     QA scenarios: happy: body estilo Rick (header+stats+holders/dev+links+trade) renderiza MarkdownV2 ≤4096, Evidence .omo/evidence/task-4-dexter-message-templates.log. failure: `{{precio}}` → 400-equivalente con `valid:[...]`; body 5000 chars render → truncated:true + marker; `{{#if}}` → error sintaxis no soportada.
     Commit: Y | feat(dexter-placeholders): registry por comando + renderer MarkdownV2
- [x] 5. settings display-mapping: DisplayMap entity+repo+resolver con specs
     What to do / Must NOT do: Crear `src/templates/domain/display-map.entity.ts` (`id, placeholderKey` ej `'chain'`, `matchValue` ej `'solana'`, `emoji` 1-8 chars grapheme, `createdAt`; validators: key en whitelist de placeholders, matchValue 1-40, emoji no vacio); `display-map.repository.ts` port; `infrastructure/.../display-map.orm-entity.ts` (tabla `dexter_display_maps`, `@Unique(['placeholderKey','matchValue'])`) + in-memory + mapper + migration; `application/emoji-resolver.service.ts`: `resolve(key, value)` case-insensitive trim, fallback `""`, `resolveAll` para renderer. Seed por defecto: `chain`: solana🟣 ethereum🔷 base🔵 bsc🟡 arbitrum🔵 polygon🟪 unknown⬜ + `tone`? NO (v1 solo chain). Specs: resolve exacto/case/fallback/duplicado→error. NO emojis en `chainDisplay` hardcodeados en templates (siempre via resolver).
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 8,10,11
     References: `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/formatters/vip-message-formatter.adapter.ts` (CHAIN_EMOJI hardcodeado = lo que se migra a tabla), `apps/dexter-onchain-bot/src/settings/domain/chat-settings.ts:29` (`emojiMode:boolean` — v1 NO lo consulta, documentar), todos 2-3 (patron entity/repo).
     Acceptance criteria: `npm test -- emoji` verde; `resolve('chain','Solana')` → mismo que `'solana'`; `'ton'` sin mapa → `""`.
     QA scenarios: happy: CRUD + resolve matrix 6 chains, Evidence .omo/evidence/task-5-dexter-message-templates.log. failure: duplicar (chain,solana) → unique error dominio; emoji vacio → 400-equivalente.
     Commit: Y | feat(dexter-emoji): EmojiMap + resolver case-insensitive
- [x] 6. API templates: CRUD+activate+guards 409 con specs de controlador
     What to do / Must NOT do: Crear `src/templates/api/http/message-templates.controller.ts`: `GET /api/dexter/templates?command=` (lista ASC createdAt), `GET /:id`, `POST /` (CreateDto: command enum `ca|x|z|c|cc|bare`, name 1-100, bodyMarkdown 1-4000; valida placeholders contra registry → 400 con validList; 409 si `(command,name)` existe), `PATCH /:id` (rename/body; version++ en cada cambio; valida placeholders), `DELETE /:id` (409 si `isActive` o si es el ULTIMO del comando — copiar regla feed-publisher: 409 `templateInUseBinding`-like; decidir: ultimo del comando NO se puede borrar sin reemplazo), `POST /:id/activate` (transaccion: desactiva otros del comando + activa este + version++; 404 si id ajeno al comando? no: activate no cambia comando). DTOs con class-validator espejando validators. Cablear en DexterModule + `ValidationPipe` existente. Specs `message-templates.controller.spec.ts` (supertest o testing module): CRUD feliz, 400 placeholder desconocido, 409 duplicado/activo/ultimo, activate conmuta. Modelo: `apps/feed-publisher/src/llm/api/http/prompt-templates.controller.ts` + `llm-config.controller.ts` (guards 409/400). Rutas SIN auth (igual que `/dexter/*` existentes; documentar riesgo en plan §NOTAS? no: en codigo comentario `// v1 sin auth como /dexter/token`).
     Parallelization: Wave 2 | Blocked by: 2,3 | Blocks: 9,10,11
     References: `apps/feed-publisher/src/llm/api/http/prompt-templates.controller.ts`, `apps/feed-publisher/src/llm/api/http/llm-config.controller.ts` (+ specs), `apps/dexter-onchain-bot/src/telegram/api/http/dexter.controller.ts:20-51` (estilo controlador local), `apps/dexter-onchain-bot/src/dexter.module.ts:87-95` (registro controllers), todos 2-4.
     Acceptance criteria: specs controlador verdes (≥12 casos: CRUD+400+3×409+activate+version); `npx tsc` OK; curl manual `POST /api/dexter/templates` → 201 con `{id,command,name,isActive:false,version:1}`.
     QA scenarios: happy: crear→activar→listar filtra `?command=ca` con 1 activo, Evidence .omo/evidence/task-6-dexter-message-templates.log. failure: `POST` con `{{precio}}` → 400 + `valid:[...]`; `DELETE` activo → 409; `DELETE` ultimo → 409; `PATCH` comando distinto → 400 inmutable.
     Commit: Y | feat(dexter-templates): API CRUD + activate + guards
- [x] 7. Preview seco en templates/ + lista placeholders (render-only, cero sends)
     What to do / Must NOT do: En `src/templates/`: crear `application/preview-template.use-case.ts` (transient: carga template por `templateId` XOR valida `draft:{command,bodyMarkdown}` —nunca persiste drafts—, resuelve `address` via `SCAN_PIPELINE` real, renderiza con `TemplateRenderer+DisplayResolver`, devuelve `{text, truncated, parseMode:'MarkdownV2', placeholdersUsed, unknown:[]}` SIN llamar a `TelegramBotClient`; reutilizar `preview-prompt.use-case.ts` de feed-publisher como patron) + `api/http/template-preview.controller.ts` (`POST /api/dexter/templates/preview`; `templateId+draft` juntos → 400 XOR; `timeframe` validado contra VALID_TIMEFRAMES si command c/cc; propaga `{error:'Ambiguous…'/'Invalid address'}` del pipeline). En `src/placeholders/`: crear `api/http/placeholders.controller.ts` SOLO con `GET /api/dexter/placeholders/:command` → `{command, placeholders:[{key, type, nullable, example}]}` (metadata pura del registry). Specs: preview con templateId + con draft (fixture Solana), asercion strict-mock de CERO llamadas al bot, XOR→400, placeholder desconocido en draft→400+validList, timeframe invalido→400, `GET placeholders/ca` ≥22 claves. NO persistir drafts. NO tocar el template activo (preview nunca activa nada).
     Parallelization: Wave 2 | Blocked by: 2,3,4 (+5 via renderer) | Blocks: 10,11
     References: `apps/feed-publisher/src/llm/application/use-cases/preview-prompt.use-case.ts` + `apps/feed-publisher/src/llm/api/http/llm-playground.controller.ts` (patron preview/playground DENTRO del BC de templates), `apps/dexter-onchain-bot/src/templates/domain/*` + `application/template-renderer` (todos 2-4), `apps/dexter-onchain-bot/src/scan/application/pipeline/token-scan.pipeline.ts` (resolve), `apps/dexter-onchain-bot/src/telegram/api/http/dexter.controller.ts` (GET /dexter/token?address= maneja ambiguous/invalid/not-found — copiar shapes), `apps/dexter-onchain-bot/src/commands/application/handlers/c-token-chart.handler.ts:9` (VALID_TIMEFRAMES).
     Acceptance criteria: specs verdes incl. `preview NO llama a sendMessage` (mock strict) y `preview NO modifica isActive de ningun template` (assert repo intacto); `GET placeholders/ca` lista ≥22 claves; preview con address fixture devuelve text con `$SYM` y `parseMode MarkdownV2`.
     QA scenarios: happy: preview templateId + preview draft con address Solana fixture, Evidence .omo/evidence/task-7-dexter-message-templates.log. failure: `templateId+draft` juntos → 400 XOR; address basura → `{error:'Invalid address'}`; `{{xxx}}` en draft → 400 + validList; `timeframe:'9m'` → 400.
     Commit: Y | feat(dexter-preview): preview seco en templates/ + lista placeholders
- [x] 8. API display-maps CRUD con specs
     What to do / Must NOT do: Crear `src/templates/api/http/display-maps.controller.ts`: `GET /api/dexter/display-maps?placeholderKey=chain`, `POST /` (`{placeholderKey, matchValue, display}`; 400 key fuera de whitelist / display vacio; 409 duplicado), `PATCH /:id` (display/matchValue), `DELETE /:id`. DTOs class-validator. Specs: CRUD + 400 + 409 + resolve-e2e via Preview (`chain:solana` → 🟣 en text). Cablear en DexterModule.
     Parallelization: Wave 2 | Blocked by: 5 | Blocks: 10,11
     References: todo 5 (entity/repo/resolver), todo 6 (estilo controlador), `apps/dexter-onchain-bot/src/dexter.module.ts`.
     Acceptance criteria: specs verdes (≥8 casos); `POST` duplicado → 409.
     QA scenarios: happy: crear (chain,ton,💎) → preview con chain=ton lo muestra, Evidence .omo/evidence/task-8-dexter-message-templates.log. failure: `placeholderKey:'precio'` → 400; display `''` → 400.
     Commit: Y | feat(dexter-emoji): API CRUD emoji-maps
- [x] 9. Seed inicial + servicio idempotente desde corpus in-repo (vendorizar ejemplos)
     What to do / Must NOT do: Vendorizar el corpus del checkout hermano `/Users/bryanstevens/dev/onchain-bot/.kiro/specs/feature-dexter/examples.md` (208 lineas, leido 2026-10-01) a `apps/dexter-onchain-bot/docs/examples-vendored.md` (copia literal + nota de origen; NO dependencia viva con `.kiro/`); crear `src/templates/infrastructure/seed/message-template-seed.service.ts` (idempotente: por cada `(command,name)` si no existe → crea + activa el primero; si existe → no-op; corre en `onApplicationBootstrap` cuando `DEXTER_SEED_TEMPLATES=true` default true en dev): seeds MarkdownV2: `ca/full-dexter-v1` (anatomia `docs/examples-for-dexter/rick-bot-scanner.md`: header `{{chainDisplay}} ${{symbol}} | {{name}} — {{chain}}` + contract code + 💰/📦/👥/🔗/🤖 lineas) + `ca/compact-rick-v1` (estilo Proficy: precio/vol/B-S + MC/Liq/age); `x/full-dexter-v1` (= ca full); `z/compact-v1` (2 lineas, migracion del `formatCompact` legacy a MarkdownV2); `c/chart-v1` + `cc/chart-only-v1` (SOLO-TEXTO con links: `Chart ({{timeframe}}): {{dexscreenerUrl}}`, sin keyboard por diseño); `bare/bare-ca-v1` (= ca full). Todos con placeholders del registry, escape delegado al renderer, ≤4000 chars. Spec `message-template-seed.service.spec.ts` (doble corrida → mismo conteo; 1 activo por comando). Referenciar `format-comparison.md` (decision entities-parse/MarkdownV2-send) en comentarios.
     Parallelization: Wave 2 | Blocked by: 3,6 | Blocks: 10,11
     References: `docs/examples-for-dexter/rick-bot-scanner.md`, `docs/examples-for-dexter/format-comparison.md`, vendored `apps/dexter-onchain-bot/docs/examples-vendored.md` (este todo la crea), `apps/feed-publisher` seed/migration pattern (`llm-config-migration.service.ts` historico en backend), `apps/dexter-onchain-bot/src/scan/infrastructure/formatter/message-formatter.ts:62-100` (anatomia actual a replicar en templates).
     Acceptance criteria: `DEXTER_SEED_TEMPLATES=true` boot → 7 seeds creados, 6 comandos con exactamente 1 activo; 2º boot → 0 creados; `npm test -- seed` verde.
     QA scenarios: happy: seed en DB vacia + preview de cada seed con fixture Solana (7 previews OK), Evidence .omo/evidence/task-9-dexter-message-templates.log. failure: seed con `{{typo}}` en fixture → boot NO tumba (log error + skip, resto activa); re-seed tras borrar 1 → solo recrea ese.
     Commit: Y | feat(dexter-templates): seed inicial 7 templates MarkdownV2
- [x] 10. Integracion handlers /ca /x + bare-address al template activo (fallback built-in)
      What to do / Must NOT do: Modificar `ca.handler.ts:22-54 sendFullScan`, `x-token-scan.handler.ts:18-40`, `bare-address.handler.ts:30-53`: tras `pipeline.resolve` OK → `templates.findActiveByCommand(cmd)` (ca/x usan su comando; bare usa `bare` y si no hay activo cae a `ca`); si hay activo → `renderer.render(body, tokenView+emoji+links)` → `bot.sendMessage(chatId, text, {parse_mode:'MarkdownV2'})` (SIN reply_markup, como hoy `ca.handler.ts:51-53`); si NO hay activo → fallback `formatter.formatScanCard` (built-in, documentado). Errores/textos sin template se conservan (`Uso: /ca <contrato>`, `No se pudo resolver`, `No veo ningun contrato`). Inyectar `MessageTemplateRepository+TemplateRenderer+DisplayResolver` por ctor (value imports). Actualizar specs `start-ca.spec.ts` + `command-router-bare-forward.spec.ts` (+ nuevos `template-integration.spec.ts`): activo renderiza `{{symbol}}` sustituido; sin activo → built-in; unknown en template → mensaje error usuario (no crash). NO tocar router parse/rate-limit. NO keyboards.
      Parallelization: Wave 2 | Blocked by: 4,6,9 (+5,8) | Blocks: 13
      References: `apps/dexter-onchain-bot/src/commands/application/handlers/ca.handler.ts:22-83`, `x-token-scan.handler.ts:18-40`, `bare-address.handler.ts:30-53`, `apps/dexter-onchain-bot/src/scan/infrastructure/formatter/message-formatter.ts:62-100`, `apps/dexter-onchain-bot/src/commands/application/router/command-router.service.ts:52-111`, specs existentes `start-ca.spec.ts` + `command-router-bare-forward.spec.ts`.
      Acceptance criteria: `npm test -- "ca|bare|router"` verde incl. nuevos casos template-activo/sin-activo; `GET /dexter/token?address=` inalterado (sigue built-in; el cambio de esa ruta llega en 13).
      QA scenarios: happy: activar `ca/compact-rick-v1` → `/ca <fixture>` devuelve card compacta MarkdownV2 via gateway mock, Evidence .omo/evidence/task-10-dexter-message-templates.log. failure: template activo con `{{xxx}}` (colado pre-validacion) → usuario recibe error explicito + se loguea, bot no crashea; pipeline null → `❌ No se pudo resolver` como hoy.
      Commit: Y | feat(dexter-commands): /ca /x + bare usan template activo
- [x] 11. Integracion /z /c /cc a templates (compact+chart solo-texto, timeframe, MarkdownV2)
      What to do / Must NOT do: Modificar `z-compact-scan.handler.ts:36-58` (migra `formatTokenScan({compact:true})` legacy Markdown → template `z` MarkdownV2; body seed `z/compact-v1`), `c-token-chart.handler.ts:24-61` + `cc-chart-only.handler.ts:24-61` (templates `c`/`cc` con `{{timeframe}}` validado contra `VALID_TIMEFrames` ANTES de render; texto link-only `📈 Chart ({{timeframe}}): {{dexscreenerUrl}}`; ELIMINAR `reply_markup.inline_keyboard` del send — abandono documentado con comentario `// gateway SendDto sin reply_markup: link en texto`; `parse_mode:'MarkdownV2'`). Uso/timeframe-invalido/no-resuelto se conservan hardcodeados. Specs: z compacto via template; c/cc con tf valido/invalido; asercion `sendMessage` llamado SIN `reply_markup`. NO reintroducir keyboards.
      Parallelization: Wave 2 | Blocked by: 4,6,9 (+5,8) | Blocks: 13
      References: `apps/dexter-onchain-bot/src/commands/application/handlers/z-compact-scan.handler.ts:36-58`, `c-token-chart.handler.ts:24-61`, `cc-chart-only.handler.ts` (espejo), `apps/dexter-onchain-bot/src/telegram/infrastructure/gateway/gateway-send-client.service.ts` (drop reply_markup — justificacion), `apps/telegram-bots-gateway/src/send/api/http/dto/send.dto.ts` (sin reply_markup — justificacion).
      Acceptance criteria: `npm test -- "z-compact|c-token|cc-chart"` verde; `/c <addr> 1h` con template activo → text contiene `1h` + dexscreener URL, `reply_markup` undefined en el mock del bot.
      QA scenarios: happy: 3 comandos con templates activos responden MarkdownV2, Evidence .omo/evidence/task-11-dexter-message-templates.log. failure: `/c <addr> 9m` → `⚠️ Timeframe invalido` (sin tocar templates); template `c` sin `{{timeframe}}` en body → render OK (placeholder opcional, no error).
      Commit: Y | feat(dexter-commands): /z /c /cc usan templates MarkdownV2 link-only
- [x] 12. Rename src/telegram/ → src/gateway/ (git mv, cero comportamiento) + docs
      What to do / Must NOT do: `git mv apps/dexter-onchain-bot/src/telegram apps/dexter-onchain-bot/src/gateway`; re-point TODOS los imports `@/telegram/` → `@/gateway/` + relativos `../../telegram/` en `src/` (verificar `grep -rn "@/telegram/" apps/dexter-onchain-bot/src` = 0 + `grep -rn "from '.*telegram/"` = 0 tras el cambio); actualizar `src/dexter.module.ts` imports, `tsconfig` paths si referencian telegram (alias `@/*` cubre, pero revisar `tsconfig.eslint.json`), `AGENTS.md` §STRUCTURE/MODULES (telegram/ → gateway/ en tabla + diagrama), comentarios con `src/telegram/` en codigo. Aceptacion: `npx tsc --noEmit` OK + `npm test` verde + `npm run build` OK + boot `:4060` con route-diff vacio (`GET /dexter/token` + `/api/health` spot-check) + `grep -r "telegram/" apps/dexter-onchain-bot/src --include="*.ts" -l` solo hits legitimos (Bot API strings, nombres Telegram, NO paths). `bot-client.ts`/`trade-button-registry.ts`/`inline-keyboard.builder.ts` se mudan tal cual (son transporte+teclados = gateway). NO cambios funcionales en este todo (diff conductual = 0; si un spec falla por import, arreglar import, no logica).
      Parallelization: Wave 3-primero | Blocked by: 10,11 | Blocks: 13
      References: `apps/dexter-onchain-bot/src/dexter.module.ts:1-50` (imports a re-point), `apps/dexter-onchain-bot/AGENTS.md:48-95` (STRUCTURE a actualizar), `apps/dexter-onchain-bot/tsconfig.json` + `tsconfig.eslint.json` + `nest-cli.json`.
      Acceptance criteria: `grep -rn "@/telegram/" apps/dexter-onchain-bot/src | wc -l` = 0; tsc+build+jest verdes; boot + `curl /api/health` OK; `git status` muestra solo renames+edits de imports/docs.
      QA scenarios: happy: full suite + boot + 2 spot curls, Evidence .omo/evidence/task-12-dexter-message-templates.log. failure: revertir con `git mv` inverso deja arbol compilando (procedimiento en mensaje de commit? no: solo verificar que no hay imports colgados via tsc).
      Commit: Y | refactor(dexter-gateway): rename telegram/ → gateway/ sin cambios
- [x] 13. Wiring final DexterModule + GET /dexter/token expone template activo
      What to do / Must NOT do: Registrar en `DexterModule`: repos templates + emoji (TypeORM+in-memory switch por `DATABASE_ENABLED`), `TemplateRendererService`, `DisplayResolverService`, `PreviewTemplateUseCase`, `MessageTemplateSeedService`, 4 controladores (`message-templates` + `template-preview` en `src/templates/api/http/`, `placeholders` en `src/placeholders/api/http/`, `display-maps` en `src/templates/api/http/`); verificar que NO aparecen ciclos `forwardRef` (single-root se mantiene); `dexter.controller.ts GET /dexter/token?address=` devuelve ademas `{templateUsed: {command,name,version}|null, text}` (usa `ca` activo o built-in; shapes de error ambiguous/invalid/not-found intactos de `dexter-controller-bare.spec.ts`); `POST /dexter/health` inalterado. Actualizar specs `dexter-controller-bare.spec.ts` (nuevo campo). Value imports en todos los ctor nuevos.
      Parallelization: Wave 3 | Blocked by: 10,11,12 | Blocks: 14
      References: `apps/dexter-onchain-bot/src/dexter.module.ts:87-240` (composition root), `apps/dexter-onchain-bot/src/gateway/api/http/dexter.controller.ts:20-51`, `apps/dexter-onchain-bot/src/gateway/api/http/dexter-controller-bare.spec.ts`, `apps/dexter-onchain-bot/src/settings/infrastructure/config/bot.config.ts` (flags `DEXTER_SEED_TEMPLATES`, `DATABASE_ENABLED`).
      Acceptance criteria: `npm test` FULL verde (todas las suites); boot con `DATABASE_ENABLED=false` (in-memory: templates seed en memoria, APIs responden) y `=true` (TypeORM) ambos OK; `GET /dexter/token?address=<fixture>` incluye `templateUsed`.
      QA scenarios: happy: full suite + doble boot (false/true) + curl token con templateUsed, Evidence .omo/evidence/task-13-dexter-message-templates.log. failure: `DATABASE_ENABLED=true` sin DB → error legible al boot (no hang); ciclo DI accidental → Nest UnknownDependenciesException con mensaje que nombra el provider.
      Commit: Y | feat(dexter-wiring): registra templates/placeholders/emoji + token expone template
- [x] 14. Docs + CHANGELOG + evidence pack final
      What to do / Must NOT do: Actualizar `apps/dexter-onchain-bot/AGENTS.md` (§STRUCTURE: `templates/` top-level + `placeholders/` + `gateway/`; §MODULES; nota MarkdownV2+`{{}}`+1-activo-por-comando+chart-link-only+gestion-solo-HTTP-API; precedente feed-publisher como canon; NOTA de desambiguacion: `src/templates/` = plantillas del bot Dexter, NO las futuras `templates` del frontend feed); `CHANGELOG.md` (entrada `feat:` con comandos cubiertos + renuncia keyboards + enum cerrado v1 + misma desambiguacion en una linea); `docs/examples-for-dexter/` NO se toca (solo se leyo); consolidar `.omo/evidence/task-*-dexter-message-templates.log` + `jest`/`tsc` finales en pack. NO codigo en este todo. Verificar `.docs-map.jsonc`/`npm run docs:check` sin nuevos warnings bloqueantes.
      Parallelization: Wave 3-ultimo | Blocked by: 13 | Blocks: F1-F4
      References: `apps/dexter-onchain-bot/AGENTS.md`, `apps/dexter-onchain-bot/CHANGELOG.md`, `.docs-map.jsonc`, `scripts/check-docs-staleness.mjs`.
      Acceptance criteria: `npm run docs:check` sin errores nuevos; AGENTS refleja arbol final `commands/ health/ scan/ settings/ templates/ placeholders/ gateway/`; CHANGELOG con entrada versionada.
      QA scenarios: happy: docs:check + grep arbol en AGENTS, Evidence .omo/evidence/task-14-dexter-message-templates.log. failure: N/A (docs-only; si docs:check avisa, registrar warning, no bloquear).
      Commit: Y | docs(dexter-templates): AGENTS + CHANGELOG + evidence pack

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy

- Un commit por todo (14) + ninguno en F1-F4 (auditoria). Prefijos: `feat(dexter-templates|dexter-placeholders|dexter-emoji|dexter-commands|dexter-preview|dexter-wiring)`, `chore(dexter-db)`, `refactor(dexter-gateway)`, `docs(dexter-templates)`. Rama `feat/dexter-bot` (este worktree); jamas commit directo en `master`; `git reset --hard`/`revert --no-commit` prohibidos. Cada commit con spec verde del todo + `tsc --noEmit` del app.
- Commits atomicos + push por round: al cerrar cada wave (`Wave 1 tras todo 5`, `Wave 2 tras todo 11`, `Wave 3 tras todo 14`) → `git push origin feat/dexter-bot`. No acumular waves sin pushear; si el push falla por divergencia con `origin/dev`, mergear `origin/dev` primero (nunca rebase/force sin orden explicita).
- Cierre con PR (tras F1-F4 todos APPROVE): push final → `gh pr create --base dev --head feat/dexter-bot --title 'feat(dexter): message templates + placeholders + gateway' --body 'Plan: .omo/plans/dexter-message-templates.md. Worktree: ../onchain-bot-feat-dexter'` → verificar `gh pr view` + CI verde → **dejar el PR abierto para merge humano** (nunca mergear solo). Limpieza del worktree solo tras el merge, segun WORKTREE.md Cierre-PR.

## Success criteria

- [x] `GET /api/dexter/templates` lista N por comando con exactamente ≤1 activo; `activate` conmuta transaccionalmente.
- [x] `/ca /x` + bare-address responden con el template activo (MarkdownV2, `{{chain}}`→emoji segun chain, ≤4096); sin activo → built-in `formatScanCard`.
- [x] `/z /c /cc` responden con sus templates (chart solo-texto con links, `{{timeframe}}` validado, cero `reply_markup` enviado).
- [x] Preview seco nunca llama al bot (spec strict-mock lo prueba) y lista `placeholdersUsed`.
- [x] `grep -rn "@/telegram/" apps/dexter-onchain-bot/src | wc -l` = 0; arbol final `commands/ health/ scan/ settings/ templates/ placeholders/ gateway/`; full `npm test` + `tsc` + `build` + boot `:4060` verdes.
- [x] Seed idempotente: 7 templates, 6 comandos con 1 activo; doble boot sin duplicados.
- [ ] Push por wave cumplido (3 pushes) + PR abierto contra `dev` con CI verde, sin mergear (merge humano).
