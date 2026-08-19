---
slug: fix-dedup-level-4-and-refactor-level-3
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/fix-dedup-level-4-and-refactor-level-3.md
approach: Fix sharp in Docker → then refactor Level 3 from hard block to scorer signal → verify Level 4 end-to-end
---

# Draft: fix-dedup-level-4-and-refactor-level-3

## Components (topology ledger)

| id  | outcome                                                                                   | status   | evidence path                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **Fix sharp on staging Docker** — EmbeddingService carga modelo `Xenova/all-MiniLM-L6-v2` | active   | `apps/backend/Dockerfile:11` (--ignore-scripts), `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts:14` (MODEL_PATH)                                                                                                              |
| C2  | **Refactor Level 3 URL match** — de hard block a señal en el scorer                       | active   | `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts:214-231` (checkUrl hard block), `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:256` (urlBoost ya modelado) |
| C3  | **Verify Level 4 end-to-end on staging** — embeddings + scorer + gray_zone                | active   | `apps/backend/src/shared/deduplication/application/services/deduplication.service.ts:178-365` (checkSemantic), `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:202-290` (computeScore)                                        |
| C4  | **Optional: Activate LLM arbiter for gray_zone** — mock → real LLM                        | deferred | `apps/backend/src/shared/deduplication/application/services/llm-arbiter.service.ts`, `deploy-staging.yml:170-176` (USE_MOCK_AI)                                                                                                                              |

## Open assumptions (announced defaults)

| assumption                                                      | adopted default                                                                      | rationale                                                                                                                                   | reversible?                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Sharp fix: usar `libvips` apt + `npm rebuild sharp`             | Instalar `libvips` en runtime stage + `RUN npm rebuild sharp` en build stage         | Sharp necesita libvips.so en runtime; --ignore-scripts salta postinstall que descarga binario. Skillsmith/Docker docs confirman este patrón | Yes (si no funciona, probar `--platform=linux --libc=glibc`) |
| No migrar a `@huggingface/transformers` v3                      | Quedarse con `@xenova/transformers` v2                                               | Ya está instalado y funcionando (solo falta sharp). v3 podría tener breaking changes y no está probado                                      | Yes (opción futura)                                          |
| Refactor Level 3: URL overlap count se pasa al scorer existente | `urlOverlapCount` ya existe en `ScoreInput` y `computeScore()`. Solo falta cablearlo | El scorer ya tiene urlBoost, solo necesita recibir el dato                                                                                  | Yes                                                          |
| LLM arbiter se deja con USE_MOCK_AI por ahora                   | No tocar el LLM arbiter en este plan                                                 | Scope crece mucho. El mock sirve para development. La decisión de activar LLM real es separada                                              | Yes                                                          |

## Findings (cited - path:lines)

### Root cause: sharp + Docker

- `apps/backend/Dockerfile:11` — `RUN npm ci --no-audit --no-fund --ignore-scripts` omite el postinstall de sharp que descarga el binario nativo
- `apps/backend/Dockerfile:25` — runtime stage instala `wget` y `gosu` pero NO `libvips` que sharp necesita en runtime
- `apps/backend/Dockerfile:18` — runtime usa `node:22-bookworm-slim` (Debian glibc), mismo que build stage
- `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts:14` — modelo `Xenova/all-MiniLM-L6-v2`
- `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts:40-41` — `import { pipeline, env } from '@xenova/transformers'` — esto carga sharp al importar
- Error en staging: `sharp/lib/sharp.js` no encuentra `sharp-linux-x64.node` porque no se compiló/downloadó

### Level 3 URL hard block handler

- `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts:214-231` — `checkUrl()` es hard block: si cualquier URL ya se vio en 48h → bloquea
- `apps/backend/src/shared/deduplication/domain/services/url-normalizer.service.ts:35-45` — `extractUrls()` extrae URLs del contenido con regex `https?://\S+`

### Scorer already has urlOverlapCount

- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:12-26` — `ScoreInput` incluye `urlOverlapCount`
- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:256-257` — `urlBoost = input.urlOverlapCount > 0 ? cfg.urlBoost : 0`
- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:267-278` — score final = semantic + jaccard + urlBoost + proximityBoost - numberPenalty - entityPenalty - cashtagPenalty

### EmbeddingService already fails open

- `apps/backend/src/shared/deduplication/application/services/deduplication.service.ts:194-201` — si `!this.embeddingService` → `isDuplicate: false`
- `apps/backend/src/shared/deduplication/application/services/deduplication.service.ts:207-212` — si `embed()` falla → catch → `isDuplicate: false`

### Tests exist

- `apps/backend/src/shared/deduplication/application/services/__tests__/deduplication.service.spec.ts`
- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts`
- `apps/backend/src/shared/deduplication/infrastructure/ml/__tests__/embedding.service.spec.ts`

## Decisions (with rationale)

1. **Fix sharp + libvips en Docker**: El enfoque más predecible. Skillsmith (proyecto similar con @xenova/transformers) usa `apt install libvips-dev` en builder + `npm rebuild sharp`. No requiere cambiar la imagen base ni migrar de paquete.
2. **Refactor Level 3 como señal**: Quitar el hard block en handler.ts y pasar `urlOverlapCount` al `checkSemantic` para que el scorer lo procese. El scorer ya tiene la lógica, solo falta cablearla.
3. **No mover Level 1 y 2**: Exact match y content hash quedan como hard blocks. Son duplicados reales.
4. **No tocar LLM arbiter**: Scope control. El mock ya funciona para dev.

## Scope IN

1. Dockerfile: instalar libvips en runtime + rebuild sharp después de npm ci
2. Re-build y deploy a staging
3. Verificar que EmbeddingService carga en logs de staging
4. Refactor handler: checkUrl deja de ser hard block, pasa urlOverlapCount al scorer
5. Verificar que Level 4 produce decisiones correctas en staging
6. Tests: actualizar tests existentes para cubrir los cambios

## Scope OUT (Must NOT have)

1. ❌ NO migrar de `@xenova/transformers` a otra librería
2. ❌ NO cambiar la imagen base del Docker (quedarse con `node:22-bookworm-slim`)
3. ❌ NO activar LLM real para gray_zone (dejar `USE_MOCK_AI=true`)
4. ❌ NO cambiar Level 1 (exact) ni Level 2 (content hash)
5. ❌ NO modificar el modelo de datos (DedupRecord, Fingerprint)
6. ❌ NO tocar la UI del frontend

## Open questions

Ninguna. Todas las decisiones fueron resueltas por exploración del código y web research.

## Approval gate

status: awaiting-approval

<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
