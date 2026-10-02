---
slug: dexter-message-templates
status: drafting
intent: clear
pending-action: write .omo/plans/dexter-message-templates.md
approach: TypeORM Postgres template system (precedente crypto-news-publisher) con sintaxis {{placeholder}} + MarkdownV2, emoji-mapping por chain, reorg telegram/ -> gateway/, integracion en handlers /ca /x /z /c /cc + bare-address, tests-after Jest
---

# Draft: dexter-message-templates

## Components (topology ledger)

| id                   | outcome                                                                                                                                            | status | evidence path                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| templates-crud       | N templates por comando + activar uno a la vez via API + preview seco                                                                              | active | apps/dexter-onchain-bot/src/templates (BC top-level; movido de settings/templates 2026-10-01: agregado global distinto de prefs por chat) + precedente vivo apps/feed-publisher/src/llm/ (entity+preview+playground en el mismo BC)                                      |
| placeholder-engine   | Motor Markdown {{clave}} puro + validacion + GET lista por comando                                                                                 | active | apps/dexter-onchain-bot/src/placeholders (BC top-level, fan-out 0) + precedente feed-llm-generator.adapter.ts render                                                                                                                                                     |
| emoji-mapping        | {{chain}} y placeholders con emoji por valor (solana/ethereum/base/bsc/...)                                                                        | active | apps/dexter-onchain-bot/src/templates/domain/emoji-map (mudado con templates 2026-10-01: es config de render, no pref de chat) + vip formatter CHAIN_EMOJI en apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/formatters/vip-message-formatter.adapter.ts |
| bc-reorg-gateway     | telegram/ renombrado a gateway/, BCs finales commands/health/scan/settings + templates/placeholders/gateway (templates top-level desde 2026-10-01) | active | apps/dexter-onchain-bot/src/dexter.module.ts:1-240 + apps/dexter-onchain-bot/src/telegram/infrastructure/gateway/                                                                                                                                                        |
| commands-integration | handlers /ca /x /z /c /cc + bare-address usan template activo                                                                                      | active | apps/dexter-onchain-bot/src/commands/application/handlers/ca.handler.ts:22-54 + x-token-scan/z-compact/c-token-chart/cc-chart-only/bare-address handlers                                                                                                                 |
| persistence-seed     | TypeORM + migracion + seed inicial desde examples.md                                                                                               | active | /Users/bryanstevens/dev/onchain-bot/.kiro/specs/feature-dexter/examples.md + docs/examples-for-dexter/rick-bot-scanner.md                                                                                                                                                |

## Open assumptions (announced defaults)

| assumption               | adopted default                                                                                                   | rationale                                                                                          | reversible?              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| Sintaxis placeholders    | {{clave}} double-brace, NO {clave}                                                                                | Consistente con crypto-news {{title}}/{{original}}/{{hasImage}}; evita colisiones con texto normal | Si (migrable con script) |
| ParseMode                | MarkdownV2 con escapeV2 centralizado + cap 4096                                                                   | Telegram Bot API exige escape; formatter actual ya lo hace (message-formatter.ts:102-105,158-177)  | Si                       |
| Profundidad placeholders | Solo nivel-1 sobre ResolvedToken + derivados (chainEmoji, tradeLinks, devLine) — sin expresiones ni condicionales | v1 determinista, sin mini-lenguaje; condicionales = N templates distintos                          | Si (fase 2)              |
| Scope por defecto        | Templates globales por comando (NO por chat/grupo en v1)                                                          | settings/chat es in-memory hoy; scoping por chat llega cuando settings sea TypeORM                 | Si                       |
| Preview                  | Endpoint seco render-only en templates/, nunca publica ni encola                                                  | Copia preview-prompt.use-case.ts de feed-publisher (canon vivo, NO el backend deprecated)          | N/A                      |
| DexterModule             | Mantiene single composition-root (no un Nest module por BC)                                                       | commands<->telegram se referencian mutuo; forwardRef seria costo sin ganancia (AGENTS.md MODULES)  | Si                       |

## Findings (cited - path:lines)

- Sin motor de templates hoy: interpolacion TS fija en apps/dexter-onchain-bot/src/scan/infrastructure/formatter/message-formatter.ts:27-100 (formatTokenScan/formatScanCard, MarkdownV2, enforceLength 4096).
- Campos disponibles = ResolvedToken en apps/dexter-onchain-bot/src/scan/domain/ports/scan-pipeline.port.ts:31-54 (symbol/name/chain/address/priceUsd/priceChange24h/marketCapUsd/liquidityUsd/fdvUsd/totalSupply/circulatingSupply/maxSupply/holders/top10HolderPercent/devWallets/devPctSupply/poolAddress/source + volume24hUsd/lockedLiquidityPercent/burnedPercent).
- Precedente completo: apps/backend/src/telegram/crypto-news-publisher/domain/entities/prompt-template.entity.ts (AggregateRoot id/name/description/model/supportsVision/maxTokens/temperature/reasoningEffort/promptText/systemPromptText) + validators + TypeORM crypto_news_publisher_prompt_templates @Unique(name) + port + repo + mapper + llm-config.controller.ts (GET/POST/PATCH/DELETE, 409 si default o N keywords) + renderPrompt regex /\{\{(title|original|hasImage)\}\}/g + migration JSON->DB idempotente + preview use-case seco.
- Transporte gateway-only verificado: apps/dexter-onchain-bot/src/telegram/infrastructure/gateway/gateway-send-client.service.ts (chunks 4096, POST /api/bots/:id/send, sin reply_markup) + send-mode.ts (siempre gateway) + telegram/domain/ports/bots-gateway-sender.port.ts (vault-id only) + ingress.controller.ts POST /dexter/ingress 201. Gateway SendDto en apps/telegram-bots-gateway/src/send/api/http/dto/send.dto.ts NO tiene reply_markup (keyboards degradan a texto).
- Handlers que consumiran templates: ca.handler.ts:22-54 sendFullScan compartido (/ca /x + bare fallback), x-token-scan.handler.ts:18-40, z-compact-scan.handler.ts:36-58 (compact), c-token-chart.handler.ts:24-61, cc-chart-only.handler.ts:24-61, bare-address.handler.ts:30-53, start.handler.ts:16-61, settings-view.handler.ts:18-42, router command-router.service.ts:52-163.
- Emoji precedent: CHAIN_EMOJI map en vip-message-formatter.adapter.ts (hardcoded) — migrar a tabla/mapeo configurable por placeholder.
- Puertos: dexter :4060 (src/main.ts), gateway :4070 (telegram-bots-gateway/src/shared/config/app.config.ts). DB dexter onchain_bot_dexter RESERVADA sin TypeORM (AGENTS.md ENV INVENTORY).
- Corpus seed: /Users/bryanstevens/dev/onchain-bot/.kiro/specs/feature-dexter/examples.md (Rick/Proficy/KOLscope/Soul, 208 lineas) + docs/examples-for-dexter/rick-bot-scanner.md + format-comparison.md (decision entities-parse/MarkdownV2-send).
- Constructor-DI rule: dependencias inyectadas con value imports, nunca `import type` (AGENTS.md TS CONVENTIONS — rompe design:paramtypes).

## Decisions (with rationale)

- P1 Persistencia = TypeORM Postgres (usuario: "procede con tu recomendacion"). Rationale: sobrevive restart, reutiliza patron probado crypto-news (entity+validators+repo+mapper+controller+guards+migration); in-memory pierde /tb y templates al reiniciar.
- P2 Sintaxis = {{clave}} + MarkdownV2 (usuario aprobo). Rationale: consistencia repo + escape seguro Bot API; {clave} colisiona con texto/links.
- P3 Estructura = arbol `commands/ health/ scan/ settings/ templates/ placeholders/ gateway/` + DexterModule single-root (usuario aprobo + ajuste 2026-10-01: templates top-level fuera de settings/). Rationale: centraliza transporte en gateway/ sin pagar forwardRef; templates es agregado global (no pref por chat); simetria templates/placeholders; modules por BC quedan como trabajo futuro. Test = tests-after Jest \*.spec.ts (patron repo).
- Playground (decision 2026-10-01): v1 = preview HTTP seco (ya en plan, todo 7) + `/ca` con template activo como "ver con datos reales". NO crear/editar templates ni emojiMaps via chat de Telegram en v1 (gestion solo por HTTP API): sin auth por roles en dexter, autorar Markdown de 4000 chars por chat es mala UX, y duplica activate+preview. Un comando admin solo-lectura `/preview <template> <contrato>` queda como fase 2 opcional (barato: reusa renderer+pipeline; nombre de cara al usuario: `/preview`, no "playground").
- Markdown obligatorio (segundo mensaje usuario): templates almacenan MarkdownV2 con validacion de longitud 4096 + escapeV2; preview devuelve text+truncated+parseMode.

## Scope IN

- templates/ BC TOP-LEVEL (src/templates, NO settings/templates — decision 2026-10-01: agregado global vs prefs por chat, simetria con placeholders/, precedente feed-publisher llm/ top-level): entidad MessageTemplate (id uuid, command: ca|x|z|c|cc|bare, name unico por comando, bodyMarkdown, parseMode fijo MarkdownV2, isActive unico por comando, version, timestamps) + validators + repo port + TypeORM entity/mapper/repo + migration + seed con 1-2 templates por comando derivados de examples.md + preview seco (decision 2026-10-01: preview vive en templates/, NO BC propio — es accion sobre el template, precedente preview-prompt.use-case.ts dentro de llm/).
- placeholders/ BC (motor PURO, fan-out 0): PlaceholderRegistry (lista blanca por comando derivada de ResolvedToken + derivados chainEmoji/scanLinks/devLine/tradeHint) + TemplateRenderer (regex \{\{(\w+)\}\}, unknown -> error 400 con lista valida, escapeV2, enforceLength 4096) + GET placeholders/:command (metadata del registry).
- templates/ display-mapping (renamed DisplayMap 2026-10-01, antes EmojiMap: el catalogo guarda texto/emoji/ambos, p. ej. SOLANA→SOL/🟣/🟣 SOL): DisplayMap (placeholderKey, matchValue case-insensitive, display 1-40) CRUD + resolucion + fallback "" + orden determinista. Vive en templates/ (es config de render, no pref de chat; distancia fisica de chat-settings.emojiMode).
- gateway/ rename: git mv telegram/ -> gateway/, re-point imports, DexterModule conserva single-root, sin cambio de comportamiento (route diff vacio + boot :4060).
- Integracion handlers: /ca /x (formatScanCard via template activo), /z (compact template), /c /cc (chart templates), bare-address (usa template ca/bare activo), errores explicitos conservados (cannot resolve/ambiguous/invalid).
- API: GET /api/dexter/templates[/:id], POST/PATCH/DELETE (409 si activo o ultimo del comando), POST /api/dexter/templates/:id/activate (desactiva otros del comando, transaccion), GET /api/dexter/placeholders/:command, POST /api/dexter/templates/preview {templateId XOR draft + address}, GET/PATCH /api/dexter/emoji-maps.

## Scope OUT (Must NOT have)

- NO un Nest module por BC (se mantiene DexterModule single-root).
- NO expresiones/condicionales/bucles en templates (solo sustitucion nivel-1 + emoji-mapping).
- NO scoping por chat/grupo en v1 (templates globales por comando).
- NO keyboards reply_markup via gateway (SendDto no lo soporta; cards llevan links + trade hint hasta gateway todo 7).
- NO tocar backend chain-dexter-bot/ (read-only move source) ni .kiro/ ni apps/backend ni telegram-bots-gateway (solo consumir su API).
- NO publicar/enviar desde preview (render-only).
- NO gestion de templates/emojiMaps via chat Telegram en v1 (crear/editar/activar solo por HTTP API; `/preview` admin solo-lectura = fase 2 opcional).
- NO git reset --hard / revert --no-commit / push a master (governance: dev + PR).

## Open questions

Ninguna — usuario aprobo recomendaciones 2026-10-01 (P1/P2/P3 + markdown obligatorio).

## Approval gate

status: approved-for-execution
pending-action: worker ejecuta .omo/plans/dexter-message-templates.md via $start-work (APROBADO por usuario 2026-10-01 "procede")
approach: TypeORM Postgres template system (precedente feed-publisher vivo) con sintaxis {{placeholder}} + MarkdownV2, templates/ top-level + EmojiMap, preview en templates/, reorg telegram/ -> gateway/, integracion en handlers /ca /x /z /c /cc + bare-address, tests-after Jest, push por wave + PR a dev al cierre
