# mock-ai-dev-staging - Work Plan

## TL;DR (For humans)

**What you'll get:** Un flag `USE_MOCK_AI=true` que al activarlo en dev/staging hace que el pipeline de crypto-news funcione completo (keywords, queue, throttle, daily cap, Telegram publish) pero **sin consumir créditos de IA** — en lugar de generar un post con LLM, publica el contenido original tal cual llegó del canal de Telegram.

**Why this approach:** Es la mínima intervención posible — un early return en `CryptoNewsLlmAdapter.generateForEntry()` cuando la env var está seteada. Todo lo demás (queue, throttle, daily cap, Telegram dispatch) corre idéntico a producción. El flag se lee directo de `process.env` porque es dev tooling, no merece registro formal en AppConfig.

**What it will NOT do:** No toca el use case, no cambia tipos de retorno, no afecta producción, no modifica el frontend, no altera el formato de publicación (se manda rawContent tal cual).

**Effort:** Quick (~30 min coding + tests)
**Risk:** Low — cambio aislado en una sola clase, con test que verifica que no se llama al LLM
**Decisions to sanity-check:** Ninguna — es un flag directo

Your next move: **Approve** este plan, luego ejecutamos con `$start-work`.

---

> TL;DR (machine): Quick | Low risk | Early return in CryptoNewsLlmAdapter.generateForEntry() when USE_MOCK_AI=true, returns entry.rawContent without calling LLM. Tests + env files.

## Scope

### Must have

- Implementar flag `USE_MOCK_AI` en `CryptoNewsLlmAdapter.generateForEntry()` que retorna `entry.rawContent` sin llamar al LLM
- Tests: mock mode no llama a `llmPort.generateText()`, devuelve rawContent
- `USE_MOCK_AI=true` en `.env.dev`
- `USE_MOCK_AI=true` en `.env.staging.template`
- **Documentación de uso**: Añadir sección en el plan que explique cómo togglear el flag por ambiente

### How to toggle AI on/off per environment

| Ambiente   | Archivo           | Valor USE_MOCK_AI | Comportamiento     |
| ---------- | ----------------- | ----------------- | ------------------ |
| Dev local  | `.env.dev`        | `true`            | Mock (sin credits) |
| Dev local  | `.env.dev`        | `false` o ausente | AI real            |
| Staging    | `.env.staging`    | `true`            | Mock               |
| Staging    | `.env.staging`    | `false` o ausente | AI real            |
| Production | `.env.production` | (no existe)       | AI real (default)  |

**Lógica**: Cualquier valor que NO sea exactamente `'true'` → usa AI normal. Para probar AI en dev local, cambiar a `USE_MOCK_AI=false` o borrar la línea.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO tocar `ProcessNextQueuedArticleUseCase`
- NO modificar la firma de `generateForEntry()`
- NO tocar `app.config.ts` ni registrar en `AppConfig`
- NO afectar frontend
- NO cambiar el comportamiento de producción

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (añadir tests al spec existente)
- Framework: Jest (co-located `*.spec.ts`)
- Evidence: `.omo/evidence/task-1-mock-ai-dev-staging.txt`

## Execution strategy

### Parallel execution waves

- Wave 1 (todo 1): Implementación en `CryptoNewsLlmAdapter` + test (se pueden hacer juntos por ser el mismo archivo y spec)
- Wave 2 (todo 2): Env files (independiente)

### Dependency matrix

| Todo              | Depends on | Blocks | Can parallelize with |
| ----------------- | ---------- | ------ | -------------------- |
| 1. Código + tests | —          | —      | 2                    |
| 2. Env files      | —          | —      | 1                    |

## Todos

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Implementar mock AI en CryptoNewsLlmAdapter + tests
     What to do / Must NOT do:
  - En `crypto-news-llm.adapter.ts`, al inicio de `generateForEntry()`, verificar `process.env.USE_MOCK_AI === 'true'`
  - Si es true: loguear `this.logger.log('USE_MOCK_AI active — returning raw content, skipping LLM call')` y retornar `{ content: entry.rawContent, systemPrompt: null, userPrompt: '[mock-mode]', temperature: null, reasoningEffort: null, model: 'mock' }` sin llamar a `llmPort.generateText()`, sin cargar template, sin leer imágenes
  - NO modificar el tipo de retorno ni la firma del método
  - NO tocar `ProcessNextQueuedArticleUseCase` ni ningún otro archivo
  - En `crypto-news-llm.adapter.spec.ts`, añadir 3 tests:
    a) `returns rawContent when USE_MOCK_AI is true and does NOT call llmPort.generateText`
    b) `works with null rawTitle in mock mode`
    c) `mock mode returns model=mock and temperature=null`
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.ts:51-136` (generateForEntry completo)
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.spec.ts:137-349` (tests existentes de generateForEntry)
  - Return type en `crypto-news-llm.adapter.ts:51-58`
    Acceptance criteria (agent-executable):
  - `USE_MOCK_AI=true yarn --cwd apps/backend jest --testPathPattern='crypto-news-llm.adapter.spec' --no-coverage` pasa los 3 tests nuevos + todos los existentes
  - `USE_MOCK_AI=false yarn --cwd apps/backend jest --testPathPattern='crypto-news-llm.adapter.spec' --no-coverage` sigue pasando (modo normal no afectado)
  - `yarn --cwd apps/backend test` no rompe ningún otro test
    QA scenarios:
  - Happy: `USE_MOCK_AI=true` → mock llama a generateForEntry → verificar que devuelve rawContent y `llmPort.generateText` NO fue llamado
  - Failure: `USE_MOCK_AI=false` (o no seteado) → comportamiento normal, llama al LLM
  - Edge: rawTitle=null → mock mode no falla, devuelve rawContent sin título
  - Evidence: `.omo/evidence/task-1-mock-ai-dev-staging.txt`
    Commit: Y | `feat(crypto-news-publisher): add USE_MOCK_AI flag for dev/staging without AI credits`

- [ ] 2. Añadir USE_MOCK_AI a env files
     What to do / Must NOT do:
  - Añadir `USE_MOCK_AI=true` en `.env.dev` en la sección de crypto-news publisher (líneas ~103-105, después de `CRYPTO_NEWS_OUTPUT_CHANNEL` en línea 105)
  - En `.env.staging.template`, **añadir la sección completa de crypto-news publisher** que actualmente falta:
    ```
    # Crypto-news publisher (Bot API)
    CRYPTO_NEWS_BOT_TOKEN=
    CRYPTO_NEWS_OUTPUT_CHANNEL=
    USE_MOCK_AI=true
    ```
    (Añadir esta sección al final del archivo o donde corresponda)
  - NO tocar `.env.production.template` (producción nunca debe tener esto activo)
  - NO modificar ningún otro valor en los env files existentes
    Parallelization: Wave 2 | Blocked by: — | Blocks: —
    References:
  - `apps/backend/.env.dev:103-105` (crypto-news publisher section)
  - `apps/backend/.env.staging.template`
    Acceptance criteria (agent-executable):
  - `grep -n 'USE_MOCK_AI' apps/backend/.env.dev apps/backend/.env.staging.template` muestra `=true` en ambos archivos
    QA scenarios:
  - Verificar que `grep 'USE_MOCK_AI' apps/backend/.env.dev` devuelve `USE_MOCK_AI=true`
  - Verificar que `grep 'USE_MOCK_AI' apps/backend/.env.staging.template` devuelve `USE_MOCK_AI=true`
  - Verificar que `grep 'USE_MOCK_AI' apps/backend/.env.production.template` NO existe (no tocar producción)
  - Evidence: `.omo/evidence/task-2-mock-ai-dev-staging.txt`
    Commit: Y | (amend al commit anterior o commit separado) `chore: add USE_MOCK_AI=true to .env.dev and .env.staging.template`

## Final verification wave

> Runs in parallel after ALL todos. All must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verificar que todos los puntos de Must have están implementados y ninguno de Must NOT have fue tocado
- [ ] F2. Code quality review — revisar que el early return en CryptoNewsLlmAdapter no introduce side effects, que los tests cubren mock mode y normal mode
- [ ] F3. Real manual QA — ejecutar `cd apps/backend && USE_MOCK_AI=true npx jest --testPathPattern='crypto-news-llm.adapter.spec' --no-coverage` y verificar que pasa
- [ ] F4. Scope fidelity — git diff para confirmar que solo se tocaron: crypto-news-llm.adapter.ts, crypto-news-llm.adapter.spec.ts, .env.dev, .env.staging.template

## Commit strategy

- Un solo commit con los cambios de código + tests + env files
- Tipo: `feat(crypto-news-publisher):`
- Mensaje: `feat(crypto-news-publisher): add USE_MOCK_AI flag to skip AI generation in dev/staging`
- Si el pre-commit hook (tsc) falla, investigar antes de `--no-verify`
- Push a `origin/dev`

## Success criteria

1. `USE_MOCK_AI=true` hace que `generateForEntry()` devuelva rawContent sin llamar al LLM
2. Tests nuevos pasan en CI
3. Tests existentes no se rompen
4. Dev/staging publican contenido original; producción no se ve afectada
5. Todos los componentes del pipeline (keywords, queue, throttle, daily cap, Telegram dispatch) funcionan idéntico en ambos modos
