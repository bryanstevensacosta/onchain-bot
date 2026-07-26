---
slug: fix-dedup-level-4-and-refactor-level-3
status: awaiting-approval
intent: clear
pending-action: await-user-approval
approach: Fix sharp in Docker → refactor Level 3 from hard block to scorer signal → verify Level 4 end-to-end
---

# Plan: fix-dedup-level-4-and-refactor-level-3

## TL;DR (For humans)

**Level 4 (semantic dedup) está roto en staging porque sharp falla en Docker.** El fix es instalar `libvips` en el runtime y hacer `npm rebuild sharp` en el build. Además, **Level 3 (URL match) bloquea mensajes como duplicado cuando comparten URLs** — debe ser una señal más en el scorer, no un hard block. El scorer ya tiene `urlBoost` modelado, solo falta cablearlo desde el handler.

---

## Components (topology ledger)

| id  | outcome                                                                                   | status   | evidence path                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **Fix sharp on staging Docker** — EmbeddingService carga modelo `Xenova/all-MiniLM-L6-v2` | active   | `apps/backend/Dockerfile:11` (`--ignore-scripts`), `apps/backend/Dockerfile:25` (runtime sin `libvips`), `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts:14` (MODEL_PATH)                                                      |
| C2  | **Refactor Level 3 URL match** — de hard block a señal en el scorer                       | active   | `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts:214-231` (checkUrl hard block), `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:256` (urlBoost ya modelado) |
| C3  | **Verify Level 4 end-to-end on staging** — embeddings + scorer + gray_zone LLM arbiter    | active   | `apps/backend/src/shared/deduplication/application/services/deduplication.service.ts:178-365` (checkSemantic), `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:202-290` (computeScore)                                        |
| C4  | **Optional: Activate LLM arbiter for gray_zone** — mock → real LLM                        | deferred | `apps/backend/src/shared/deduplication/application/services/llm-arbiter.service.ts`, `deploy-staging.yml:170-176` (USE_MOCK_AI)                                                                                                                              |

## Open assumptions (announced defaults)

| assumption                                                      | adopted default                                                                                     | rationale                                                                                                                                                | reversible?                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Sharp fix: usar `libvips` apt + `npm rebuild sharp`             | Instalar `libvips` en runtime stage + `RUN npm rebuild sharp` en build stage                        | Sharp necesita `libvips.so` en runtime; `--ignore-scripts` salta postinstall que descarga binario nativo. Skillsmith + Docker docs confirman este patrón | Yes (si no funciona, probar `SHARP_IGNORE_GLOBAL_LIBVIPS=1` o prebuilt binary explícito) |
| No migrar a `@huggingface/transformers` v3                      | Quedarse con `@xenova/transformers` v2                                                              | Ya instalado y funcionando (solo falta sharp). v3 podría tener breaking changes y no está probado                                                        | Yes (opción futura)                                                                      |
| Refactor Level 3: URL overlap count se pasa al scorer existente | `urlOverlapCount` ya existe en `ScoreInput` y `computeScore()`. Solo falta cablear handler → scorer | El scorer ya tiene urlBoost, solo necesita recibir el dato desde `checkSemantic` en lugar de hacer hard block en `checkUrl`                              | Yes                                                                                      |
| LLM arbiter se deja con `USE_MOCK_AI=true` por ahora            | No tocar el LLM arbiter en este plan                                                                | Scope crece mucho. El mock sirve para dev. Decisión de activar LLM real es separada                                                                      | Yes                                                                                      |

## Findings (cited — path:lines)

### Root cause: sharp + Docker

- `apps/backend/Dockerfile:11` — `RUN npm ci --no-audit --no-fund --ignore-scripts` omite el postinstall de sharp que descarga el binario nativo
- `apps/backend/Dockerfile:25` — runtime stage instala `wget` y `gosu` pero NO `libvips` que sharp necesita en runtime
- `apps/backend/Dockerfile:18` — runtime usa `node:22-bookworm-slim` (Debian glibc), mismo que build stage
- `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts:14` — modelo `Xenova/all-MiniLM-L6-v2`
- `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts:40-41` — `import { pipeline, env } from '@xenova/transformers'` — esto carga sharp al importar
- Error en staging: `sharp/lib/sharp.js` no encuentra `sharp-linux-x64.node` porque no se compiló/downloadó

### Level 3 URL hard block

- `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts:214-231` — `checkUrl()` es hard block: si cualquier URL ya se vio en 48h → bloquea y retorna sin seguir a semantic check
- `apps/backend/src/shared/deduplication/domain/services/url-normalizer.service.ts:35-45` — `extractUrls()` extrae URLs del contenido con regex `https?://\S+`

### Scorer already has urlOverlapCount + urlBoost

- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:12-26` — `ScoreInput` incluye `urlOverlapCount`
- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:256-257` — `urlBoost = input.urlOverlapCount > 0 ? cfg.urlBoost : 0`
- `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:267-278` — score final = semantic + jaccard + urlBoost + proximityBoost - numberPenalty - entityPenalty - cashtagPenalty

### EmbeddingService fails open gracefully

- `apps/backend/src/shared/deduplication/application/services/deduplication.service.ts:194-201` — si `!this.embeddingService` → `isDuplicate: false` (no bloquea)
- `apps/backend/src/shared/deduplication/application/services/deduplication.service.ts:207-212` — si `embed()` falla → catch → `isDuplicate: false`

### Tests exist

- `apps/backend/src/shared/deduplication/application/services/__tests__/dedup-scorer.service.spec.ts` — scorer unit tests con urlBoost
- `apps/backend/src/shared/deduplication/application/services/__tests__/deduplication.service.spec.ts` — integration tests del service
- `apps/backend/src/shared/deduplication/application/services/__tests__/embedding.service.spec.ts` — embedding service tests

## Decisions (with rationale)

1. **Fix sharp + libvips en Docker**: Skillsmith (proyecto similar con `@xenova/transformers`) usa `apt install libvips-dev` en builder + `npm rebuild sharp`. No requiere cambiar imagen base ni migrar de paquete. Es el approach más predecible.
2. **Refactor Level 3 como señal**: Quitar hard block en handler.ts y pasar `urlOverlapCount` al `checkSemantic` para que el scorer lo procese. El scorer ya tiene `urlBoost`, solo falta cablear.
3. **No mover Level 1 y 2**: Exact match y content hash quedan como hard blocks. Son duplicados reales (mismo mensaje reenviado).
4. **No tocar LLM arbiter**: Scope control. El mock devuelve decisiones deterministicas; activar LLM real es decisión separada.

## Scope IN

1. Dockerfile: instalar `libvips` en runtime + `npm rebuild sharp` en build stage
2. Re-build y deploy a staging
3. Verificar que EmbeddingService carga correctamente en staging
4. Refactor handler: `checkUrl()` deja de hard-bloquear, expone `urlOverlapCount` al scorer vía `checkSemantic()`
5. Verificar Level 4 produce decisiones correctas en staging (con simulación de mensajes)
6. Tests: actualizar tests existentes para cubrir los cambios

## Scope OUT (Must NOT have)

1. ❌ NO migrar de `@xenova/transformers` a otra librería
2. ❌ NO cambiar la imagen base del Docker (quedarse con `node:22-bookworm-slim`)
3. ❌ NO activar LLM real para gray_zone (dejar `USE_MOCK_AI=true`)
4. ❌ NO cambiar Level 1 (exact) ni Level 2 (content hash)
5. ❌ NO modificar el modelo de datos (DedupRecord, Fingerprint, ScoreInput schema)
6. ❌ NO tocar la UI del frontend

## Tasks

### Task batch 1 — Fix sharp on Docker + deploy & verify

| #   | Task                                                                                                   | Prio   |
| --- | ------------------------------------------------------------------------------------------------------ | ------ |
| T1  | `apps/backend/Dockerfile`: Add `libvips` install in runtime stage + `npm rebuild sharp` in build stage | high   |
| T2  | Push to `dev` branch, verify GitHub Actions deploy passes                                              | high   |
| T3  | SSH to staging: `docker logs onchain-bot-staging-backend \| grep -i embedding` — confirm model loads   | high   |
| T4  | SSH to staging: `docker exec ... ls /usr/lib/x86_64-linux-gnu/libvips*` — confirm libvips installed    | medium |

**QA (C1)**:

- Build locally: `docker build -t test-sharp apps/backend` should succeed without sharp errors
- Staging log shows `[EmbeddingService] Loading embedding model: Xenova/all-MiniLM-L6-v2` and NOT `sharp-linux-x64.node` errors

### Task batch 2 — Refactor Level 3 from hard block to signal

| #   | Task                                                                                                                                   | Prio   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T5  | `crypto-news-message-ingested.handler.ts`: Remove hard block in `checkUrl()`, return `urlOverlapCount` instead                         | high   |
| T6  | `deduplication.service.ts`: Wire `urlOverlapCount` from URL check into semantic check via `checkSemantic()` signature                  | high   |
| T7  | `dedup-scorer.service.spec.ts`: Update test to verify `urlBoost` applies when `urlOverlapCount > 0` (no hard block)                    | medium |
| T8  | `deduplication.service.spec.ts`: Add test case for two messages sharing URLs — expect `isDuplicate: false` but scorer receives overlap | medium |

**QA (C2)**:

- `npm run test:backend` passes all dedup tests
- Handler test: two messages with same URL → handler does NOT return early at URL check, continues to semantic
- Scorer test: `computeScore()` with `urlOverlapCount=2` → score includes `urlBoost` signal

### Task batch 3 — Verify Level 4 end-to-end

| #   | Task                                                                                                            | Prio   |
| --- | --------------------------------------------------------------------------------------------------------------- | ------ |
| T9  | Send two similar messages (same URL, different text) through staging pipeline                                   | high   |
| T10 | Check logs for: `[DedupScorer] url_boost` signal + `[DedupScorer] zone: gray_zone\|different` (not `duplicate`) | high   |
| T11 | Verify DedupRecord created with embedding in DB                                                                 | medium |

**QA (C3)**:

- Manual test: trigger crypto-news event with two semantically similar messages sharing a URL
- Expect: Level 1 passes, Level 2 passes, URL check does NOT hard-block, semantic check runs, scorer produces score with urlBoost, verdict is `gray_zone` or `different`
- DB query: `SELECT * FROM dedup_records WHERE url_overlap_count > 0` returns records

## TODOs

- [x] 1. `apps/backend/Dockerfile` — Add `libvips` install in runtime stage + `npm rebuild sharp` in build stage
  - ✅ `docker build` succeeds without sharp errors
  - ✅ `RUN npm rebuild sharp` added at line 12
  - ✅ `libvips` added to apt-get at line 26
- [x] 2. Push to `dev` branch, monitor GitHub Actions deploy — confirm green
  - ✅ Commit `4db1ed5` pushed to `dev`
  - ✅ All 1454 tests passed (pre-push hook)
  - ✅ Staging deploy completed — backend + frontend containers healthy
- [x] 3. SSH staging: `docker logs onchain-bot-staging-backend | grep -i embedding` — model loads
  - ✅ `[EmbeddingService] Loading embedding model: Xenova/all-MiniLM-L6-v2`
  - ✅ `[EmbeddingService] Embedding model loaded successfully`
  - ✅ No sharp errors
- [x] 4. SSH staging: verify libvips installed in container
  - ✅ `libvips.so.42` found at `/usr/lib/x86_64-linux-gnu/`
- [x] 5. `crypto-news-message-ingested.handler.ts` — Remove hard block in `checkUrl()`, return `urlOverlapCount` instead
  - ✅ URL hard block removed; handler passes urlOverlapCount to checkSemantic
  - ✅ Test updated: `should pass URL overlap as signal instead of blocking`
- [x] 6. `deduplication.service.ts` — Wire `urlOverlapCount` from URL check into `checkSemantic()`
  - ✅ `checkSemantic()` now accepts `urlOverlapCount: number = 0` parameter
  - ✅ Both `DedupScorer.computeScore()` calls use the parameter
- [x] 7. `dedup-scorer.service.spec.ts` — Update test to verify `urlBoost` applies when `urlOverlapCount > 0`
  - ✅ New comprehensive test added with orthogonal embeddings
- [x] 8. `deduplication.service.spec.ts` — Add test: two messages sharing URLs → `isDuplicate: false`, scorer receives overlap
  - ✅ Handler test passes urlOverlapCount to checkSemantic
- [ ] 9. Send two semantically similar messages (same URL, different text) through staging pipeline
  - QA: Pipeline ingests both without hard-blocking at Level 3
  - Adversarial: stale state (previous dedup records interfere), cancel/resume
- [ ] 10. Check staging logs for `[DedupScorer] url_boost` signal + `zone: gray_zone|different`
  - QA: Scorer produces urlBoost, verdict is NOT `duplicate`
- [ ] 11. Query DedupRecords in staging DB — confirm embedding stored and url_overlap_count > 0
  - QA: `SELECT * FROM dedup_records WHERE url_overlap_count > 0` returns records

## Final Verification Wave

- [ ] F1. All backend tests pass: `npm run test:backend`
- [ ] F2. All lint passes: `npm run lint`
- [ ] F3. All TypeScript checks pass: `npm run build` (backend)
- [ ] F4. Clean up: cancel disposable background tasks, remove test artifacts

## Approval gate

status: **approved**

All forks resolved by code exploration + web research. Draft reviewed by Momus — no blockers found. QA scenarios defined per component. User approved execution.
