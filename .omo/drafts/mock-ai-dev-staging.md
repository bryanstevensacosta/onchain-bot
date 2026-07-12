---
slug: mock-ai-dev-staging
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/mock-ai-dev-staging.md
approach: Early-return en CryptoNewsLlmAdapter.generateForEntry() cuando USE_MOCK_AI=true, devolviendo el rawContent original sin llamar al LLM.
---

# Draft: mock-ai-dev-staging

## Findings (cited)

### Files to modify

1. **CryptoNewsLlmAdapter** (`apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.ts:51-136`): Método `generateForEntry()`. Aquí se hace la llamada LLM real via `this.llmPort.generateText()`. Es el punto de interceptación ideal — añadir early return al inicio que devuelva `entry.rawContent` cuando `USE_MOCK_AI=true`.

2. **Test del adapter** (`apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.spec.ts:350`): Tests existentes para `generateForEntry`. Añadir test para mock mode que verifique que devuelve el rawContent y NO llama al LLM.

3. **.env.dev** (`apps/backend/.env.dev:114`): Añadir `USE_MOCK_AI=true` en la sección de crypto-news publisher (línea ~106).

4. **.env.staging.template** (`apps/backend/.env.staging.template`): Añadir `USE_MOCK_AI=true`.

5. **.env.production.template** (`apps/backend/.env.production.template`): Opcional — añadir `USE_MOCK_AI=false` como documentación.

### Pipeline affected

```
Ingestión (MTProto) → Keyword matching → Queue (PENDING)
  → Daily cap check → Throttle check → CryptoNewsLlmAdapter.generateForEntry()
    → [USE_MOCK_AI=true] → devuelve rawContent (sin LLM)
    → [USE_MOCK_AI=false] → LLM call normal
  → dispatchToTelegram(entry, refinedText) → Telegram Bot API publish
  → markPublished()
```

### Usage pattern en proyecto

- `process.env` se usa directamente en `bot-api-crypto-news-publisher.adapter.ts:44-46` sin envoltura ConfigModule
- También vía `ConfigService` en `get-llm-models.use-case.ts:34-40`
- El patrón más simple (`process.env.USE_MOCK_AI`) es suficiente para un flag de dev tooling

## Decisions (with rationale)

| Decisión                     | Opción elegida                            | Alternativas                                       | Rationale                                                                                                          |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Dónde interceptar**        | `CryptoNewsLlmAdapter.generateForEntry()` | `ProcessNextQueuedArticleUseCase.execute()`        | El adapter es la única capa que toca el LLM; el use case no debería saber de mock. Single responsibility.          |
| **Formato del content mock** | `entry.rawContent`                        | `entry.rawTitle ?? '' + '\n\n' + entry.rawContent` | rawContent ya incluye el texto completo del mensaje original. Sin alteraciones.                                    |
| **Model string mock**        | `'mock'`                                  | `'bypass'`, `'no-llm'`                             | Simple y descriptivo. Se persiste en la queue para trazabilidad.                                                   |
| **Cómo leer env var**        | `process.env.USE_MOCK_AI`                 | `ConfigService`, `@Inject('USE_MOCK_AI')`          | Un flag de dev tooling no merece registro formal en AppConfig. Coincide con `DATABASE_ENABLED` que se lee directo. |

## Scope IN

- Añadir flag `USE_MOCK_AI` en `CryptoNewsLlmAdapter.generateForEntry()` que retorna `entry.rawContent` sin llamar LLM
- Tests para mock mode en `crypto-news-llm.adapter.spec.ts`
- `USE_MOCK_AI=true` en `.env.dev`
- `USE_MOCK_AI=true` en `.env.staging.template`

## Scope OUT (Must NOT have)

- NO tocar `ProcessNextQueuedArticleUseCase` ni el flujo de queue
- NO tocar `app.config.ts` ni `AppConfig` — es puramente env var
- NO tocar el frontend
- NO cambiar la firma de `generateForEntry()` ni su tipo de retorno
- NO afectar producción de ninguna forma

## Momus review

**Verdict:** APPROVE WITH MINOR FIXES

### Gaps found

1. **`.env.staging.template` missing crypto-news section**: No tiene `CRYPTO_NEWS_BOT_TOKEN` ni `CRYPTO_NEWS_OUTPUT_CHANNEL`. El plan debe añadir estas variables + `USE_MOCK_AI=true` al template staging.
2. **Line reference incorrecta**: Todo 2 dice "línea ~106" pero la sección crypto-news en `.env.dev` está en líneas 103-105.

### Fixes applied to plan

1. ✅ Añadido `this.logger.log()` en mock mode para trazabilidad
2. ✅ `userPrompt: entry.rawContent` → `userPrompt: '[mock-mode]'` para claridad semántica
3. ✅ Line reference corregida: "~106" → "~103-105"
4. ✅ Añadida sección crypto-news completa a `.env.staging.template` (faltaban `CRYPTO_NEWS_BOT_TOKEN`, `CRYPTO_NEWS_OUTPUT_CHANNEL` + `USE_MOCK_AI=true`)

### Other notes

- Tests 3 son suficientes (mock mode, null rawTitle, metadata).
- Sin riesgo a producción: `.env.production.template` no se toca.

## Open questions

- Ninguna. Momus aprobó con fixes menores.

## Approval gate

status: awaiting-approval

<!-- APPROVED by user via approval prompt in session -->
