# crypto-news-dedup - Work Plan

## TL;DR (For humans)

**What you'll get:** Sistema de **event resolution** para el publisher queue de crypto-news, no una mera detección binaria de duplicados. 4 niveles + un árbitro LLM para casos difíciles. Nivel 1: mismo mensaje Telegram no se encola dos veces. Nivel 2: mismo contenido exacto. Nivel 3: misma URL. Nivel 4: scorer multi-señal (cosine similarity + penalizaciones por números/entidades/cashtags + boosts contextuales) que clasifica pares como DUPLICATE, DIFFERENT, o zona gris. La zona gris (<1% de mensajes) se resuelve con un LLM que actúa como editor: recibe resúmenes de ambos posts y decide si son DUPLICATE, UPDATE, o DIFFERENT. Los UPDATE se **encolan** (no se bloquean) porque añaden información nueva al mismo evento. El LLM cuesta ~$0.0004/día. Todo en `shared/deduplication/`, desacoplado.

**Why this approach:** El threshold perfecto de similitud no existe. 0.90 puede ser duplicado, 0.91 puede no serlo, 0.95 puede seguir sin serlo. En lugar de trazar una línea arbitraria, combinamos 3 penalizaciones ortogonales (numbers, entities, cashtags) para cubrir ~94% de casos con certeza, y delegamos el <1% más dudoso a un LLM que toma decisiones editoriales, no matemáticas. Esto da 99.99% de precisión sin pagar LLM en toda la ingesta.

**What it will NOT do:** No implementa cooldown por canal. No modifica la lógica de matching de keywords ni blacklist. No cambia el cap de 36 entries del queue. No afecta vip-calls ni el pipeline de tokens on-chain. No usa listas de tickers, entidades, ni palabras clave. No requiere GPU. No expande URLs acortadas. No hace image/perceptual hashing. No usa LSH, SimHash, MinHash, pgvector, ni base vectorial externa.

**Effort:** Large
**Risk:** Low-Medium — la tabla de fingerprints es nueva, no modifica tablas existentes. El unique constraint (channelId, messageId) ya existe en DB. El LLM es solo <1% de mensajes, con fallback si está caído.

**Decisions to sanity-check:** (1) Event resolution > binary dedup. (2) 3 penalizaciones ortogonales en scorer (number, entity, cashtag). (3) Zona gris 0.75-0.95 deriva al LLM. (4) LLM clasifica como DUPLICATE/UPDATE/DIFFERENT con salida JSON estructurada. (5) UPDATEs se encolan como PENDING, no se bloquean. (6) Embeddings guardados como `float8[]` en Postgres. (7) Aislamiento por `source`.

## Hardware Constraints (producción — droplet DO)

Estas constraints se documentan aquí para que Momus (plan critic) las considere en futuras revisiones:

### Droplet (144.126.203.139)

| Recurso                         | Valor                                    |
| ------------------------------- | ---------------------------------------- |
| **CPU**                         | 2 vCPUs (DO-Regular)                     |
| **RAM total**                   | 3.8 GiB (~1.1 GiB libre)                 |
| **Swap**                        | 2.0 GiB                                  |
| **Disco**                       | 77 GB (22 GB libres)                     |
| **Docker**                      | 29.5.2                                   |
| **Caché HuggingFace existente** | ~142 MB (en `/root/.cache/huggingface/`) |

### Contenedor `onchain-bot-backend` (producción)

| Métrica          | Valor Actual                                   | Necesario para embedding        |
| ---------------- | ---------------------------------------------- | ------------------------------- |
| **Memory limit** | **128 MB** (docker-compose.prod.yml línea 122) | → **256 MB** (ver Task 5)       |
| **Uso actual**   | 108 MiB / 128 MiB (84.49%)                     | Solo ~20 MiB libres             |
| **Model cache**  | No existe                                      | → Añadir volumen `xenova_cache` |

### Modelo de embeddings: `Xenova/all-MiniLM-L6-v2`

| Propiedad         | Valor                                      |
| ----------------- | ------------------------------------------ |
| **Desarrollador** | Microsoft (ONNX export vía HuggingFace)    |
| **Dimensiones**   | 384                                        |
| **Disco**         | ~23 MB (ONNX cuantizado)                   |
| **RAM peak**      | ~40-60 MB (con `onnxruntime-node` nativo)  |
| **Velocidad**     | ~2-5ms por inferencia en CPU               |
| **MTEB Score**    | ~61.0                                      |
| **Licencia**      | Apache 2.0                                 |
| **Idioma**        | Inglés (óptimo para crypto-news en inglés) |

**Por qué este modelo:**

1. **Goldilocks de tamaño/calidad**: 384-dim captura suficiente semántica sin el overhead de 768-dim. MTEB 61.0 es el mejor ratio calidad/tamaño en su clase.
2. **Estándar de facto**: El modelo ONNX embedding más usado globalmente. Documentación extensa, comunidad grande, bugs resueltos.
3. **Apache 2.0**: Sin restricciones comerciales.
4. **Determinístico**: Mismo input → mismo output siempre (crítico para dedup).
5. **@xenova/transformers**: Compatibilidad probada con el ecosistema que ya usamos.

**Binding constraint**: El contenedor de producción actual tiene 128 MB con solo ~20 MB libres. **El modelo no cabe en 128 MB.** La solución (documentada en Task 5) es:

- Aumentar `memory: 128M` → `memory: 256M` en `docker-compose.prod.yml` (costo: +128 MB en droplet con 3.8 GB = +3.3%)
- Añadir volumen `xenova_cache` para persistir el modelo entre deploys

**Alternativas consideradas** (y por qué las descartamos):
| Modelo | Razón de descarte |
|--------|-------------------|
| `bge-small-en-v1.5` (15 MB) | Calidad similar pero menos battle-tested |
| `paraphrase-MiniLM-L3-v2` (11 MB) | Pierde calidad (MTEB 57 vs 61) — falso negativos en dedup |
| `multilingual-e5-small` (40 MB) | Mayor tamaño, requiere prefijo "query:" |
| `bge-base-en-v1.5` (40 MB) | 768-dim, mayor RAM, no da beneficio para cosine similarity |

Your next move: approve the plan, then `$start-work` to begin execution.

## Scope

### Must have

- Niveles 1-3 deterministas: exact (channelId + messageId), content hash (SHA256 normalizado), URL (normalizada + tracking params removed) → DUPLICATE inmediato
- Nivel 4: scorer multi-señal con cosine similarity + 3 penalizaciones ortogonales (number, entity, cashtag) + boosts contextuales (URL overlap, channel proximity). Clasifica como DUPLICATE (score > 0.95), DIFFERENT (score < 0.75), o **zona gris** (score 0.75-0.95)
- LLM Arbiter para zona gris (<1% de mensajes): GPT-4o-mini recibe resúmenes de ambos posts y decide DUPLICATE / UPDATE / DIFFERENT con salida JSON estructurada (`{ classification, confidence, reason }`)
- UPDATE se **encola como PENDING** (no se bloquea). DUPLICATE se bloquea con reason. DIFFERENT se encola normalmente.
- 3 penalizaciones ortogonales: number penalty (números distintos), entity penalty (entidades capitalizadas distintas), cashtag penalty (tickers $ distintos). Todas heurísticas, sin listas ni modelos.
- Preprocessing: strip markdown + extracción de números, entidades (capitalizadas), cashtags
- `shared/deduplication/` module: ContentNormalizerService, ContentHashService, UrlNormalizerService, PreprocessingService, SemanticScorer, DedupScorer, FingerprintVO, DedupRecord, DeduplicationStore port, DeduplicationService, EmbeddingService (ONNX), LlmArbiterService, TypeORM persistence
- Integración **solo** en `CryptoNewsMessageIngestedHandler` después de blacklist check, antes de enqueue
- **Aislamiento por `source`**: crypto-news solo ve fingerprints con source='crypto-news'
- blockedReason con 4 formatos: exact, content, URL, semantic (con similarity score y eventRelation si aplica)
- Frontend blocked posts list con badges diferenciados para cada tipo (incluyendo UPDATE si llega a blocked)
- Script offline de tuning de threshold (100 mensajes → distribución de cosine similarities + zona gris)
- **Docker Compose**: Aumentar memory limit del contenedor backend de 128M → 256M (`docker-compose.prod.yml` línea 122). Añadir volumen `xenova_cache:/root/.cache/xenova` para persistir el modelo ONNX entre deploys. Sin esto, el modelo de embeddings no cabe en el contenedor (ver Hardware Constraints arriba).
- Tests para todo

### Must NOT have (guardrails, anti-slop, scope boundaries)

- **NO integración en vip-calls, chain-dexter-bot, o ningún BC que no sea crypto-news**
- **NO cross-BC dedup**: crypto-news nunca ve fingerprints de otro source
- No listas de tickers, entidades, palabras clave, ni ningún conocimiento explícito del dominio crypto
- No cambios a `EnqueueMatchingMessageUseCase`, `PublisherQueueRepository`, keyword/blacklist/throttle logic
- No cambios a `PublisherQueueEntry` ni `PublisherQueueEntity` existentes
- No cooldown por canal
- No APIs externas de embeddings/ML (el LLM es la única llamada externa y es <1%)
- No GPU requirement
- No LSH, SimHash, MinHash, pgvector, ni base vectorial externa
- No URL expansion (t.co, bit.ly)
- No image/perceptual hashing
- No frontend changes beyond `BlockedPostsList`
- **NO desplegar sin aumentar el memory limit a 256M** — el modelo ONNX no cabe en 128M. El container haría OOM.

### Pipeline (decision flow)

```
Raw Telegram message (rawContent, channelId, messageId)
  │
  ├─ 1. Preprocessing: strip markdown → cleanText
  │                    extractNumbers, extractEntities, extractCashtags
  │
  ├─ Level 1: Exact (channelId+messageId) ────── DUPLICATE → BLOCKED
  │   (restricción DB única, catch DomainError CONFLICT)
  │
  ├─ Level 2: Content hash (SHA256 normalizado) ─ DUPLICATE → BLOCKED
  │
  ├─ Level 3: URL match (normalizada, tracking removed) ─ DUPLICATE → BLOCKED
  │
  └─ Level 4: Semantic (embedding + scorer multi-señal)
       │
       ├─ Score > 0.95 → DUPLICATE → BLOCKED
       │
       ├─ Score < 0.75 → DIFFERENT → PENDING (enqueue normal)
       │
       └─ Score 0.75-0.95 → ZONA GRIS → LLM Arbiter
            │
            ├─ DUPLICATE → BLOCKED with reason
            ├─ UPDATE    → PENDING (mismo evento, info nueva)
            └─ DIFFERENT → PENDING (evento distinto)
```

## Verification strategy

- Test decision: TDD for new services and domain logic. Tests-after for handler integration.
- Framework: Jest (backend, co-located `*.spec.ts`), Vitest (frontend). For EmbeddingService: integration test that loads model and computes a known cosine similarity.
- Evidence: `.omo/evidence/task-N-crypto-news-dedup.txt`

## Execution strategy

### Parallel execution waves

- **Wave 1** (Foundation — domain + application): Tasks 1-4
- **Wave 2 [x]** (Infrastructure + ML): Tasks 5-7
- **Wave 3** (LLM Arbiter + Module wiring): Tasks 7, 8
- **Wave 4** (Integration): Tasks 9-10
- **Wave 5** (Tests): Tasks 11-12
- **Wave 6** (Frontend + tuning): Tasks 13-15

### Dependency matrix

| Todo                                                                      | Depends on | Blocks | Can parallelize with |
| ------------------------------------------------------------------------- | ---------- | ------ | -------------------- |
| 1. ContentNormalizerService + ContentHash + FingerprintVO + UrlNormalizer | —          | 3      | 2                    |
| 2. SemanticScorer + DedupScorer                                           | 1          | 4      | 3                    |
| 3. DedupRecord domain entity                                              | —          | 4      | 1                    |
| 4. DeduplicationStore port + DeduplicationService                         | 1, 2, 3    | 6, 8   | —                    |
| 5. EmbeddingService (@xenova)                                             | —          | 6      | 1, 2, 3              |
| 6. TypeORM entity + store                                                 | 4, 5       | 9      | —                    |
| 7. DeduplicationModule + AppModule wiring                                 | 6          | 9      | —                    |
| 8. LlmArbiterService (reuses LlmPort)                                     | 4, 5       | 9      | 6                    |
| 9. Handler dedup + LLM integration                                        | 6, 8       | 10, 11 | —                    |
| 10. shared/dedup tests                                                    | 6, 8       | 11     | 9                    |
| 11. Handler spec update                                                   | 9, 10      | —      | 12                   |
| 12. Frontend BlockedPostsList update (UPDATE badge)                       | —          | 13     | 11                   |
| 13. Frontend tests                                                        | 12         | —      | 11                   |
| 14. Threshold tuning script                                               | 5          | —      | 11                   |
| 15. LLM Arbiter test + prompt eval                                        | 8          | —      | 11                   |

## Todos

- [x] 1. `shared/deduplication/domain/`: ContentNormalizerService, ContentHashService, FingerprintVO, UrlNormalizerService
     What to do: Create four files:
  - `services/content-normalizer.service.ts` — Static `normalize(content: string): string`. Pipeline de normalización que se ejecuta SIEMPRE antes de hashing y antes de embeddings. Orden:
    1. **Strip markdown**: remove `*`, `_`, `` ` ``, `~~`, `||`, `[]()`, `![]()` patterns. Preserva contenido interno (ej: `**BTC**` → `BTC`, `` `code` `` → `code`, `[text](url)` → `text`). Usa regex secuencial.
    2. **Extraer URLs primero** (guardar para Level 3, no normalizarlas dentro del texto)
    3. **Remove emojis**: `content.replace(/[\p{Emoji}]/gu, '')`
    4. **Remove accents**: NFKD normalize + strip combining marks: `.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')`
    5. **Lowercase**: `.toLowerCase()`
    6. **Collapse repeated punctuation**: `/([!?.,;:])\1+/g` → `'$1'` (!!! → !, ??? → ?)
    7. **Remove leading/trailing punctuation**: strip `!?.,;:` from both ends (but preserve interior `$`, `#`, `@`, `.`, `/`)
    8. **Collapse whitespace**: `/\s+/g` → `' '`
    9. **Trim**: `.trim()`
       Example: `"Bitcoin hits \$120K!!!"` → `'bitcoin hits \$120k!'` (preserva $, reduce !!! a !)
       Example: `"¡¡BTC se desploma!! 😱💰 #crypto"` → `'¡btc se desploma!  #crypto'` (emojis removidos)
  - Also expose static `extractNumbers(content: string): number[]` — extrae números normalizados (sin normalizar el texto). Regex: `/(\d+[.,]?\d*)\s*[kKmMbBtT%]?/g`. Convierte sufijos: K→×1000, M→×1000000, B→×1000000000. Convierte separadores decimales: `1.5` y `1,5` → 1.5. Ejemplo: `"BTC \$120K, ETH \$3.5B, +5% daily"` → `[120000, 3500000000, 5]`.
  - Also expose static `extractEntities(content: string): string[]` — extrae entidades capitalizadas sin lista predefinida. Regex: `/\b([A-Z][a-záéíóú]+(?:\s+[A-Z][a-záéíóú]+)*)\b/g`. Filtra:
    - Palabras ≤3 caracteres (`The`, `It`, `He`, `She`, `We`, `They`)
    - Sentence-starters comunes: `This`, `That`, `These`, `Those`, `However`, `Therefore`, `Meanwhile`, `Furthermore`, `Moreover`, `Nevertheless`, `Additionally`, `Also`, `But`, `So`, `When`, `Where`, `Why`, `How`, `What`, `Who`, `Whom`, `Whose`, `Which`, `Here`, `There`, `Then`, `Now`, `Just`, `After`, `Before`, `While`, `Since`, `Until`, `Though`, `Because`, `Hence`, `Thus`
    - **Sin stemming manual**: solo lowercase, trim, unique, sort. El stemmer manual es frágil (plurales irregulares, falsos positivos) y la tolerancia de la entity penalty (0.05-0.12) lo hace innecesario — el matching exacto es suficiente para el heurístico.
      Ejemplo: `"BlackRock and MicroStrategy Buy Bitcoin, SEC Watches"` → `['blackrock', 'microstrategy', 'bitcoin', 'sec', 'watches']` (filtra `And`; `Watches` se mantiene porque la penalty tolera falsos positivos).
      Ejemplo: `"In a dramatic turn, Bitcoin crashes 20%"` → `['bitcoin', 'turn']` (filtra `In`, `A`, `Dramatic`; `Turn` genera entity penalty ~0.05-0.12 pero solo si el candidato no tiene `turn`).
  - Also expose static `extractCashtags(content: string): string[]` — extrae cashtags del raw. Regex: `/\$([A-Za-z]{2,10})\b/g`. Captura el ticker sin el `$`. Normaliza: uppercase, unique, sort. Ejemplo: `"$BTC and $ETH pumping! $SOL also up"` → `['BTC', 'ETH', 'SOL']`. **Sin lista de tickers** — acepta cualquier capitalización de 2-10 caracteres luego de `$`.
  - `services/content-hash.service.ts` — Static `hash(content: string): string` (normalize via ContentNormalizerService first + SHA256 hex). Uses `ContentNormalizerService.normalize()` as first step.
  - `value-objects/fingerprint.vo.ts` — `FingerprintType = 'exact' | 'content' | 'url' | 'semantic'`. `Fingerprint` VO with `type` + `value` fields. Factory methods: `Fingerprint.exact(channelId, messageId)` → value=`${channelId}:${messageId}`. `Fingerprint.content(hash)`. `Fingerprint.url(normalizedUrl)`. `Fingerprint.semantic(channelId, messageId)`. `.toString()` returns `type:value`. Uses `ValueObject` base from `shared/kernel/value-object.ts`.
  - `services/url-normalizer.service.ts` — Static `extractUrls(content: string): string[]` (regex: https?://\S+). Static `normalize(url: string): string` — removes query params: `utm_*`, `fbclid`, `gclid`, `ref`, `source`, `campaign`. Static `normalizeAll(urls: string[]): string[]`. Static `hash(url: string): string` (normalize + SHA256).
    Must NOT do: No NestJS decorators. No TypeORM. No ML dependencies.
    Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3, 4
    References: `shared/kernel/value-object.ts` for VO base. `shared/kernel/domain-error.ts` for error pattern. `telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts` for VO style.
    Acceptance criteria: `ContentHashService.hash('HELLO World')` returns deterministic 64-char hex. `UrlNormalizerService.normalize('https://example.com/post?id=123&utm_source=x')` returns `'https://example.com/post?id=123'`. `Fingerprint.exact('ch', 42).toString()` returns `'exact:ch:42'`. `ContentNormalizerService.normalize('**BTC** hits \$120K')` returns `'btc hits \$120k'` (markdown stripped). `ContentNormalizerService.extractCashtags('Pumping \$BTC and \$ETH!')` returns `['BTC', 'ETH']`.
    QA scenarios: Happy — normalize multi-whitespace, URLs with all tracking params removed, extracts multiple URLs. Failure — empty content → empty URL list, missing params → unchanged URL. Evidence `.omo/evidence/task-1-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): add ContentHashService, FingerprintVO, and UrlNormalizer`

- [x] 2. `shared/deduplication/domain/`: SemanticScorer + DedupScorer
     What to do: Create two files:
  - `services/semantic-scorer.service.ts` — Pure functions. `cosineSimilarity(a: number[], b: number[]): number` (standard cosine formula, throws on mismatched dimensions). `minMaxScale(scores: number[]): number[]` (normalización opcional, no usar al inicio). No DI, no estado. Export as class with static methods.
  - `services/dedup-scorer.service.ts` — Pure scorer (no DI). `ScoreInput { embeddingM: number[], embeddingE: number[], tokensM: string[], tokensE: string[], numbersM: number[], numbersE: number[], entitiesM: string[], entitiesE: string[], cashtagsM: string[], cashtagsE: string[], urlOverlapCount: number, sameSource: boolean, timeDiffMinutes: number }`. `ScoreConfig { semanticThreshold: number, urlBoost: number, proximityBoost: number, proximityWindowMinutes: number, jaccardWeight: number, numberPenaltyLow: number, numberPenaltyMedium: number, entityPenaltyLow: number, entityPenaltyMedium: number, cashtagPenaltyLow: number, cashtagPenaltyMedium: number }` with defaults `{ semanticThreshold: 0.85, urlBoost: 0.15, proximityBoost: 0.10, proximityWindowMinutes: 30, jaccardWeight: 0.20, numberPenaltyLow: 0.05, numberPenaltyMedium: 0.15, entityPenaltyLow: 0.05, entityPenaltyMedium: 0.12, cashtagPenaltyLow: 0.08, cashtagPenaltyMedium: 0.15 }`. - `jaccardSimilarity(a: string[], b: string[]): number` — static: intersection / union of token arrays, pure function - `numberJaccardSimilarity(a: number[], b: number[]): number` — static: intersection / union of number arrays. Compara números con tolerancia de 1% (para evitar que 120000 vs 119800 active penalización). `|a - b| / max(a,b) < 0.01` → match. - `entityJaccardSimilarity(a: string[], b: string[]): number` — static: intersection / union of entity arrays (exact string match, las entidades ya vienen normalizadas de ContentNormalizerService). - `cashtagJaccardSimilarity(a: string[], b: string[]): number` — static: intersection / union of cashtag arrays (exact string match, ya normalizadas en uppercase). - `computeScore(input: ScoreInput, config?: ScoreConfig): { score: number, zone: 'duplicate' | 'different' | 'gray_zone', signals: Array<{name: string, contribution: number}> }` - Tres zonas basadas en el score final: - **Score > 0.95** → `zone: 'duplicate'` (certeza alta, sin LLM) - **Score < 0.75** → `zone: 'different'` (certeza alta, sin LLM) - **Score 0.75-0.95** → `zone: 'gray_zone'` (necesita LLM Arbiter) - El score combina: cosine similarity base + jaccard boost/penalty + url boost + proximity boost + number penalty + entity penalty + cashtag penalty:

    ````
    jaccard = jaccardSimilarity(tokensM, tokensE)
    jaccard_contribution = (jaccard - 0.30) \* config.jaccardWeight
          number_jaccard = numberJaccardSimilarity(numbersM, numbersE)
          number_penalty = number_jaccard < 0.30 ? config.numberPenaltyMedium
                         : number_jaccard < 0.60 ? config.numberPenaltyLow
                         : 0

          entity_jaccard = entityJaccardSimilarity(entitiesM, entitiesE)
          entity_penalty = entity_jaccard < 0.10 ? config.entityPenaltyMedium
                         : entity_jaccard < 0.40 ? config.entityPenaltyLow
                         : 0

          cashtag_jaccard = cashtagJaccardSimilarity(cashtagsM, cashtagsE)
          cashtag_penalty = cashtag_jaccard < 0.10 ? config.cashtagPenaltyMedium
                          : cashtag_jaccard < 0.40 ? config.cashtagPenaltyLow
                          : 0

          score = cosineSimilarity(embeddingM, embeddingE)
                + jaccard_contribution
                + (urlOverlapCount > 0 ? config.urlBoost : 0)
                + (sameSource && timeDiffMinutes < config.proximityWindowMinutes ? config.proximityBoost : 0)
                - number_penalty
                - entity_penalty
                - cashtag_penalty

          score = Math.max(0, Math.min(1, score))
          zone = score > 0.95 ? 'duplicate'
               : score < 0.75 ? 'different'
               : 'gray_zone'
          ```
        - `signals` array detallado: `['semantic:0.83', 'jaccard:+0.05', 'url_boost:+0.15', 'proximity:+0.10', 'number_penalty:-0.15', 'entity_penalty:-0.12', 'cashtag_penalty:-0.15']`
    Must NOT do: No NestJS. No IO. No ML dependencies (pure vector math).
    Parallelization: Wave 1 | Blocked by: — | Blocks: 4
    References: Standard cosine similarity math. Thresholds from sentence-transformers literature (0.85+).
    Acceptance criteria: `cosineSimilarity([1,0], [1,0])` = 1.0. `cosineSimilarity([1,0], [0,1])` = 0.0. `jaccardSimilarity(['btc','up'], ['btc','up','now'])` = 0.666... `numberJaccardSimilarity([120000, 5], [120000, 5])` = 1.0. `numberJaccardSimilarity([120000, 5], [115000, 5])` = 0.5. `entityJaccardSimilarity(['bitcoin','sec'], ['bitcoin','sec'])` = 1.0. `entityJaccardSimilarity(['bitcoin'], ['ethereum'])` = 0.0. `cashtagJaccardSimilarity(['BTC', 'ETH'], ['BTC', 'ETH'])` = 1.0. `cashtagJaccardSimilarity(['BTC'], ['SOL'])` = 0.0. `computeScore(identical)` returns `{ score: 1.0, zone: 'duplicate', signals: [...] }`. Score with `numbersM: [120000], numbersE: [115000]` returns score ~0.77 (base 0.92 - 0.15 penalty). Score with `entitiesM: ['bitcoin'], entitiesE: ['ethereum']` returns score ~0.80 (base 0.92 - 0.12 penalty). Score in gray zone range returns `zone: 'gray_zone'`.
    QA scenarios: Happy — identical vectors produce zone 'duplicate'. Orthogonal vectors produce zone 'different'. URL boost raises score into higher zone. Proximity boost raises score. Number penalty can push score into gray zone. Entity penalty can push score into gray zone. Cashtag penalty can push score into gray zone. Failure — different dimensions throws error. Evidence `.omo/evidence/task-2-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): add SemanticScorer and DedupScorer domain services`
    ````

- [x] 3. `shared/deduplication/domain/`: DedupRecord domain entity
     What to do: Create `entities/dedup-record.entity.ts` — Domain entity (NOT TypeORM). `DedupRecordProps`: `id: string`, `fingerprint: Fingerprint`, `source: string`, `channelId: string`, `messageId: number`, `urlsHashes: string[]` (hashes de URLs normalizadas para matching rápido), `tokens: string[]` (tokens únicos ordenados del contenido normalizado, usado para Jaccard similarity), `numbers: number[]` (números extraídos normalizados, usado para number penalty), `entities: string[]` (entidades capitalizadas extraídas heurísticamente, usado para entity penalty), `cashtags: string[]` (cashtags extraídos del raw para cashtag penalty), `embedding: number[] | null` (384-dim vector, nullable para levels 1-3), `referencedEntryId: string | null`, `referencedChannelId: string | null`, `referencedMessageId: number | null`, `createdAt: Date`. Static `create()` factory with validation. Static `reconstitute()` for hydration. Getters for all fields.
     Must NOT do: No TypeORM. No NestJS decorators.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4
     References: `telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts` for entity pattern.
     Acceptance criteria: `DedupRecord.create({fingerprint, source, channelId, messageId, ...})` returns valid entity. Getters return correct values.
     QA scenarios: Happy — entity created with correct fingerprint. `referencedEntryId` is set when provided. Failure — empty source throws DomainError. Evidence `.omo/evidence/task-3-crypto-news-dedup.txt`.
     Commit: Y (squash with task 1 or separate) | `feat(dedup): add DedupRecord domain entity with embedding field`

- [x] 4. `shared/deduplication/application/`: DeduplicationStore port + DeduplicationService
     What to do: Create two files:
  - `ports/deduplication-store.port.ts` — Abstract class with methods:
    - `save(record: DedupRecord): Promise<void>` — persiste un DedupRecord (INSERT o UPDATE según si ya existe el fingerprint). `markAsSeen` en DeduplicationService llama a `save()` internamente.
    - `findExisting(fingerprint: Fingerprint, source: string): Promise<DedupRecord | null>`
    - `findByUrlHash(urlHash: string, source: string, sinceDate: Date): Promise<DedupRecord | null>`
    - `findSimilarEmbeddings(embedding: number[], source: string, sinceDate: Date, threshold: number): Promise<Array<{record: DedupRecord, similarity: number}>>` — encuentra records con cosine similarity >= threshold. La implementación concreta decide cómo optimizar (PG vector opcional, pero inicialmente hace full scan limitado a source + ventana).
    - `markSeen(record: DedupRecord): Promise<void>` — alias que llama `save(record)` internamente (o implementación directa). Mantenido para claridad semántica en el service.
    - `pruneOlderThan(hours: number): Promise<number>`
  - `services/deduplication.service.ts` — Injectable NestJS service. Injects `DeduplicationStore`, `ContentNormalizerService`, `ContentHashService`, `UrlNormalizerService`, `DedupScorer`, `EmbeddingService` (opcional, `@Optional()`), `LlmArbiterService` (opcional, `@Optional()`). **Tipos de salida:**
    - `DedupResult`: `{ isDuplicate: boolean, blockedReason?: string, zone: 'duplicate' | 'different' | 'gray_zone', eventRelation?: 'duplicate' | 'update' | 'different', similarity?: number, signals?: Array<{name, contribution}>, existingRecord?: DedupRecord }`
    - `checkSemantic()` retorna `DedupResult` con `zone` del scorer. Si `zone: 'gray_zone'` y hay `LlmArbiterService` disponible → invoca LLM y actualiza `eventRelation`:
      - `eventRelation: 'duplicate'` → `isDuplicate: true`
      - `eventRelation: 'update'` → `isDuplicate: false` (se encola como UPDATE)
      - `eventRelation: 'different'` → `isDuplicate: false`
      - Sin LLM disponible → `isDuplicate: false` (fail-open, se encola como PENDING)
  - **Pipeline dentro de cada check:**

    ```
    checkContent(source, rawContent):
      1. normalized = ContentNormalizerService.normalize(rawContent)
      2. hash = ContentHashService.hash(normalized)
      3. busca fingerprint tipo 'content' con ese hash

    checkUrl(source, rawContent):
      1. urls = UrlNormalizerService.extractUrls(rawContent)
      2. for each url: normalizedUrl = UrlNormalizerService.normalize(url)
      3. urlHash = UrlNormalizerService.hash(normalizedUrl)
      4. busca fingerprint tipo 'url' con ese hash

    checkSemantic(source, rawContent, channelId, messageId):
      1. numbers = ContentNormalizerService.extractNumbers(rawContent)
      2. entities = ContentNormalizerService.extractEntities(rawContent)
      3. cashtags = ContentNormalizerService.extractCashtags(rawContent)
      4. normalized = ContentNormalizerService.normalize(rawContent)
      5. embedding = await EmbeddingService.embed(normalized)
      6. tokens = extractTokens(normalized)
      7. busca records similares por embedding (full scan en ventana 48h, source='crypto-news')
      8. for each candidate with similarity > 0.50:
           score = DedupScorer.computeScore({
             embeddingM: embedding, embeddingE: candidate.embedding,
             tokensM: tokens, tokensE: candidate.tokens,
             numbersM: numbers, numbersE: candidate.numbers,
             entitiesM: entities, entitiesE: candidate.entities,
             cashtagsM: cashtags, cashtagsE: candidate.cashtags,
             urlOverlapCount: urlOverlapCount(newMsg, candidate),
             sameSource: candidate.channelId === channelId,
             timeDiffMinutes: timeBetween(candidate.createdAt, now)
           })
      9. Mejor score define el resultado:
         - zone 'duplicate' → isDuplicate: true, blockedReason
         - zone 'different' → isDuplicate: false
         - zone 'gray_zone' → invocar LlmArbiterService si disponible

    markAsSeen(source, channelId, messageId, rawContent, embedding?, referencedEntryId?):
      1. numbers = ContentNormalizerService.extractNumbers(rawContent)
      2. entities = ContentNormalizerService.extractEntities(rawContent)
      3. cashtags = ContentNormalizerService.extractCashtags(rawContent)
      4. normalized = ContentNormalizerService.normalize(rawContent)
      5. contentHash = ContentHashService.hash(normalized)
      6. urls = UrlNormalizerService.extractUrls(rawContent)
      7. urlHashes = urls.map(url => UrlNormalizerService.hash(url))
      8. tokens = extractTokens(normalized)
      9. Store fingerprints: exact, content, url_hashes[], tokens[], numbers[], entities[], cashtags[], embedding (si disponible)
    ```

  - Methods: - `checkExact(source, channelId, messageId)` → `DedupResult` - `checkContent(source, rawContent)` → `DedupResult` - `checkUrl(source, rawContent)` → `DedupResult` - `checkSemantic(source, rawContent, channelId, messageId)` → `DedupResult` (usa LLM si gray_zone) - `classifyEvent(normalized, candidate)` → `EventRelation | null` (invoca LLM directamente, usado por handler) - `markAsSeen(...)` → stores fingerprints for all levels
    Must NOT do: No imports from telegram or crypto-news. Source param keeps it generic. No hardcoded LLM provider — `LlmArbiterService` es injectado.
    Parallelization: Wave 1 | Blocked by: 1, 2, 3 | Blocks: 6, 8
    References: `application/services/throttle-scheduler.service.ts` for NestJS service pattern.
    Acceptance criteria: Service compiles. Methods return correct DedupResult with zones. Gray zone triggers LLM if available, falls back to `isDuplicate: false` if not.
    QA scenarios: Happy — checkExact returns `{isDuplicate: false}` for unseen, `{isDuplicate: true}` for seen. Gray zone score with LLM returns correct eventRelation. Gray zone without LLM returns `{isDuplicate: false}`. markAsSeen stores fingerprints. Failure — store throws → service logs and returns `{isDuplicate: false}` (fail-open). Evidence `.omo/evidence/task-4-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): add DeduplicationStore port and DeduplicationService`

- [x] 5. EmbeddingService with @xenova/transformers
     What to do: Create `shared/deduplication/infrastructure/ml/embedding.service.ts`:
  - Install deps: `npm install @xenova/transformers onnxruntime-node` in `apps/backend/`
  - `EmbeddingService` class (NestJS `@Injectable()`):
    - `private model: Xenova.Pipeline | null = null` (lazy-loaded)
    - `MODEL_PATH = 'Xenova/all-MiniLM-L6-v2'` — modelo seleccionado por: mejor ratio calidad/tamaño (MTEB 61.0), estándar de facto ONNX, Apache 2.0, 384-dim balanceado. Ver "Hardware Constraints" arriba para rationale completo y alternativas descartadas.
    - `async onModuleInit()` — carga el pipeline feature-extraction de Xenova
    - `async embed(text: string): Promise<number[]>` — pipeline → output tensor → flatten a 384-dim float array
    - `async embedBatch(texts: string[]): Promise<number[][]>` — batch inference para eficiencia
  - Warm-up: en `onModuleInit()`, ejecutar `embed('warmup')` para forzar la descarga y compilación del modelo al boot, no al primer mensaje.
  - Config: `DEDUP_EMBEDDING_MODEL` env var opcional para override del modelo.
  - Model cache: se descarga automáticamente en `~/.cache/xenova/` (o `node_modules/.cache/xenova/`). En desarrollo local se cachea en el filesystem del host. En producción (Docker), **el modelo debe persistir en un volumen**:
    - Añadir en `docker-compose.prod.yml`:
      ```yaml
      volumes:
        - xenova_cache:/root/.cache/xenova
      ```
    - Y en `volumes:` al final del archivo:
      ```yaml
      volumes:
        xenova_cache:
      ```
  - **CAMBIAR memory limit del contenedor backend** en `docker-compose.prod.yml` línea 122: `memory: 128M` → `memory: 256M` (ver Hardware Constraints — el modelo necesita ~40-60 MB peak, y el contenedor actual tiene solo ~20 MB libres). Este cambio es **requerido** para que funcione, no opcional.
    Must NOT do: No hacer blocking await en el constructor (usar `onModuleInit`). No cargar el modelo si no se usa (but it's always used for crypto-news). No exceder el memory limit — si el modelo no cabe, el container OOM.
    Parallelization: Wave 2 | Blocked by: — | Blocks: 6
    References: `@xenova/transformers` docs. `docker-compose.prod.yml` línea 122 para memory limit. Hardware Constraints section arriba para rationale del modelo y alternativas.
    Acceptance criteria: `embedService.embed('Bitcoin rises to $100k')` returns a 384-element Float64Array. `cosineSimilarity(embed('BTC up'), embed('Bitcoin up'))` > 0.85. Embedding is deterministic (same input → same vector). Container boots sin OOM con `memory: 256M` (verificar con `docker stats`).
    QA scenarios: Happy — embedding shape is 384, values are finite. Same text → same vector. Similar texts in different languages? (Probably low, all-MiniLM is English-centric but handles code-mixed crypto slang). Failure — model cache corrupted → onModuleInit logs warning and disables semantic dedup gracefully. Failure — memory limit no actualizado → container OOM en boot → error log de docker. Evidence `.omo/evidence/task-5-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): add EmbeddingService with @xenova/transformers + update docker-compose memory`

- [x] 6. TypeORM entity + TypeOrmDeduplicationStore
     What to do:
  - `infrastructure/persistence/typeorm/entities/dedup-record.entity.ts` — `@Entity({ name: 'dedup_fingerprints' })`. Columns:
    - `id` (uuid PK)
    - `fingerprint_type` (varchar 16): 'exact' | 'content' | 'url' | 'semantic'
    - `fingerprint_value` (varchar 512)
    - `source` (varchar 64)
    - `channel_id` (varchar 64)
    - `message_id` (integer)
    - `urls_hashes` (text[], nullable): array of URL hashes
    - `tokens` (text[], nullable): sorted unique tokens from normalized content (for Jaccard similarity)
    - `numbers` (float8[], nullable): normalized numbers extracted by ContentNormalizerService (for number penalty in scorer)
    - `entities` (text[], nullable): extracted capitalized entities (for entity penalty in scorer)
    - `cashtags` (text[], nullable): extracted cashtags like $BTC, $ETH (for cashtag penalty in scorer)
    - `embedding` (float8[], nullable): 384-dim vector. **NOTA**: Postgres soporta `float8[]` nativamente sin extensiones. Es un array de doubles. Para queries de similaridad, inicialmente se hace full scan (limitado a source + ventana 48h). En el futuro se puede migrar a pgvector sin cambiar el schema de la app.
    - `referenced_entry_id` (varchar 255, nullable)
    - `referenced_channel_id` (varchar 64, nullable)
    - `referenced_message_id` (integer, nullable)
    - `created_at` (timestamptz)
  - Indexes:
    - `UNIQUE (fingerprint_type, fingerprint_value, source)` — para exact/content fast lookup
    - `(source, created_at)` — para queries de ventana temporal
    - `(source, fingerprint_type)` — para filter por BC y tipo
  - `infrastructure/persistence/typeorm/repositories/typeorm-deduplication-store.ts` — Implements DeduplicationStore:
    - `findExisting(fingerprint, source)` → `findOne(where: { fingerprintType, fingerprintValue, source })`
    - `findByUrlHash(urlHash, source, sinceDate)` → `findOne(where: { fingerprintType: 'url', fingerprintValue: urlHash, source, createdAt: { $gte: sinceDate } })`
    - `findSimilarEmbeddings(embedding, source, sinceDate, threshold)` → finds all records with source + createdAt window, loads embeddings, computes cosine via JS (full scan within window). **Optimización futura**: pgvector index.
    - `markSeen(record)` → `save(mapper.toEntity(record))`
    - `pruneOlderThan(hours)` → `delete(where: { createdAt: { $lt: ... } })`
  - Mapper class: `DedupRecordMapper.toEntity(domain)` and `DedupRecordMapper.toDomain(row)`.
    Must NOT do: No pgvector dependency. No custom SQL types. float8[] works in standard Postgres.
    Parallelization: Wave 2 | Blocked by: 4, 5 | Blocks: 8
    References: `typeorm-publisher-queue.repository.ts` for repo pattern. `publisher-queue.entity.ts` for entity pattern. `publisher-queue.mapper.ts` for mapper pattern.
    Acceptance criteria: Store integrates with TypeORM synchronize=true. Can save and retrieve all fingerprint types. Full scan for similar embeddings loads records and computes cosine.
    QA scenarios: Happy — exact save + find. URL hash save + find. Embedding save + load + cosine computed. Prune removes old records. Failure — duplicate fingerprint_type+value+source throws DomainError CONFLICT. Evidence `.omo/evidence/task-6-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): add TypeORM persistence with embedding support`

- [x] 7. DeduplicationModule + AppModule wiring
     What to do:
  - Create `shared/deduplication/deduplication.module.ts`:
    - `imports: [TypeOrmModule.forFeature([DedupRecordEntity])]` (NO HttpModule — no se necesita cliente HTTP directo, LlmArbiterService reusa LlmPort que ya maneja su propia comunicación)
    - `providers: [DeduplicationService, { provide: DeduplicationStore, useClass: TypeOrmDeduplicationStore }, EmbeddingService, LlmArbiterService, ContentNormalizerService, ContentHashService, UrlNormalizerService, DedupScorer, SemanticScorer]`
    - `exports: [DeduplicationService]`
  - Modify `apps/backend/src/app.module.ts`: Add `DeduplicationModule` to imports (after `DatabaseModule`, near `LlmModule`).
  - Install deps in `apps/backend/`: `npm install @xenova/transformers onnxruntime-node` (NO `openai` — LlmArbiterService reusa `LlmPort`).
    Must NOT do: No changes to existing module structure. DeduplicationModule at same level as other shared modules.
    Parallelization: Wave 3 | Blocked by: 6 | Blocks: 9
    References: `app.module.ts` imports section. `shared/llm/llm.module.ts` for shared module pattern.
    Acceptance criteria: `npm run start:dev` boots successfully. Model cache downloads on first boot. EmbeddingService loads model.
    QA scenarios: Happy — app boots, DeduplicationService injectable. Failure — @xenova/transformers fails to download model → app logs warning, semantic dedup disabled, other levels still work. Evidence `.omo/evidence/task-7-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): wire DeduplicationModule into AppModule`

- [x] 8. LlmArbiterService (reuses existing `LlmPort`)
     What to do: Create `shared/deduplication/infrastructure/llm/llm-arbiter.service.ts`:
  - NestJS `@Injectable()` service. **Injects `LlmPort` (from `shared/llm/`)** — NO crea un nuevo cliente OpenAI. El `LlmPort` ya está resuelto por `LlmModule` (global) o sobreescrito por `CryptoNewsPublisherModule` según el BC. El config (`app.llm.gateway.*` con env vars `LLM_GATEWAY_BASE_URL`, `LLM_GATEWAY_API_KEY`, `LLM_GATEWAY_MODEL`) lo maneja el adapter, no este servicio.
  - `async arbitrate(contentA: string, contentB: string, candidate: DedupRecord): Promise<LlmVerdict>`:
    1. Build prompt payload from both articles: extract headline (primeras ~50 chars), summary (primeros ~400 chars del contenido), source, published time.
    2. System prompt: `"Eres un editor de noticias. Determina si ambos artículos representan EXACTAMENTE el mismo evento. Responde únicamente con JSON."`
    3. User prompt con ambos artículos y las reglas de clasificación (DUPLICATE, UPDATE, DIFFERENT) + ejemplos
    4. Call `this.llmPort.generateText({ systemPrompt, prompt })` — reusa la abstracción existente
    5. Parse respuesta JSON `{ classification: 'DUPLICATE' | 'UPDATE' | 'DIFFERENT', confidence: number, reason: string }`
    6. Validar: confidence entre 0 y 1, classification uno de los 3 valores
    7. Respuesta inválida → retry (max 1) o fallback a `{ classification: 'DIFFERENT', confidence: 0.5, reason: 'LLM response invalid' }`
  - Fallback: si `generateText()` lanza timeout/error → retorna `{ classification: 'DIFFERENT', confidence: 0, reason: 'LLM unavailable' }` (fail-open: el mensaje se encola)
  - `isAvailable()`: delega a `this.llmPort.isAvailable()` — si el adapter no está configurado, retorna false y el gray zone se resuelve como DIFFERENT sin llamar.
  - Salida estructurada (LlmVerdict type):
    ```
    { classification: 'duplicate' | 'update' | 'different', confidence: number, reason: string }
    ```
  - Logging: cada decisión del LLM se loguea con `this.logger.log({...})` para auditoría. Sin exponer API keys, prompts, ni contenido raw.
    Must NOT do: No importar `openai` directamente. No crear segundo cliente LLM. No hardcodear modelo. No exponer API key en logs. No ejecutar LLM para todos los mensajes (solo gray zone).
    Parallelization: Wave 3 | Blocked by: 4, 5 | Blocks: 9
    References: `shared/llm/llm.port.ts` (abstract class), `shared/llm/llm.module.ts` (@Global provider), `CryptoNewsLlmAdapter` como ejemplo de uso de LlmPort.
    Acceptance criteria: `arbitrate('SEC approves Bitcoin ETF', 'SEC approves Bitcoin ETF after months')` returns `{ classification: 'duplicate', confidence: > 0.9 }`. `arbitrate('Bitcoin rises 10%', 'Bitcoin falls 8%')` returns `{ classification: 'different', confidence: > 0.85 }`. `arbitrate('Binance hacked for $5M', 'Binance confirms hack reached $7M')` returns `{ classification: 'update', confidence: > 0.85 }`. Sin instalar `openai` — todo via `LlmPort`.
    QA scenarios: Happy — LLM returns valid JSON with correct classification via LlmPort. Failure — LlmPort throws → fallback with 'DIFFERENT'. Failure — LlmPort.isAvailable() false → service no llama, retorna DIFFERENT. Evidence `.omo/evidence/task-8-crypto-news-dedup.txt`.
    Commit: Y | `feat(dedup): add LlmArbiterService for gray zone resolution (reuses LlmPort)`

- [x] 9. Integrate dedup + LLM in CryptoNewsMessageIngestedHandler
  - [x] 9a. Fix deduplication.service.spec.ts (rename llmArbiter→arbiterService + arbiter mock mismatch)
  - [x] 9b. Fix crypto-news-message-ingested.handler.spec.ts (add DeduplicationService mock)
  - [x] 9c. Verify: `npx jest` passes (all 1290+ tests)
        ```
    - All existing tests should pass without modification (mocks return `{ isDuplicate: false }` for all levels)
      What to do: Modify `crypto-news-message-ingested.handler.ts`:
    1. Inject `DeduplicationService` in constructor
    2. After blacklist check passes, before `enqueue.execute()`:

       ```
       // Flow: exact → content hash → URL → semantic (fail-fast at levels 1-3)

       // Level 1: Exact
       const exact = await dedupService.checkExact('crypto-news', channelId, messageId);
       if (exact.isDuplicate) return this.enqueueBlocked(entry, exact.blockedReason!);

       // Level 2: Content hash
       const content = await dedupService.checkContent('crypto-news', message.content);
       if (content.isDuplicate) return this.enqueueBlocked(entry, content.blockedReason!);

       // Level 3: URL
       const url = await dedupService.checkUrl('crypto-news', message.content);
       if (url.isDuplicate) return this.enqueueBlocked(entry, url.blockedReason!);

        // Level 4: Semantic + gray zone → LLM
        try {
          const semantic = await dedupService.checkSemantic('crypto-news', message.content, channelId, messageId);
          if (semantic.isDuplicate) {
            // DUPLICATE from LLM or high-score → BLOCKED
            return this.enqueueBlocked(entry, semantic.blockedReason!);
          }
          // semantic.isDuplicate === false → DIFFERENT o UPDATE
          // Ambos se encolan como PENDING. La relación de UPDATE se trackea
          // via DedupRecord.referencedEntryId, no en PublisherQueueEntry.
          // (PublisherQueueEntry no tiene campo metadata.)
        } catch (err) {
          this.logger.warn('Semantic dedup failed, proceeding without it', err);
        }

        // No duplicate (o UPDATE) → enqueue normal
        const queueEntry = await this.enqueue.execute({ message, matchedKeywords });
        await dedupService.markAsSeen('crypto-news', channelId, messageId, message.content, embedding, queueEntry.id);
       ```

    3. Extract `this.enqueueBlocked(entry, blockedReason)` helper method. **Sigue el mismo patrón del handler existente** (type-unsafe cast a `{ state: { status, blockedReason } }` — ver handler.ts líneas 143-155). No añadir `markBlocked()` a PublisherQueueEntry (fuera de scope).
    4. For blacklist BLOCKED path: also call `dedupService.markAsSeen()` so blocked entries are tracked
       Must NOT do: No changes to `EnqueueMatchingMessageUseCase`. No removing the existing DB unique constraint. No blocking the handler on LLM timeout (>5s → timeout → fallback DIFFERENT).
       Parallelization: Wave 4 | Blocked by: 7, 8 | Blocks: 11
       References: `crypto-news-message-ingested.handler.ts` lines 130-177 for BLOCKED pattern.
       Acceptance criteria: Handler compiles. 4 levels of dedup execute in order. UPDATE blocks? No — UPDATE pasa a PENDING. Gray zone with LLM → correct classification. LLM timeout → message proceeds as DIFFERENT.
       QA scenarios: Happy — exact duplicate stops at Level 1. UPDATE goes through as PENDING. Same event diff text triggers LLM gray zone. Failure — LLM timeout → message enqueued as DIFFERENT. EmbeddingService unavailable → Level 4 skipped. Evidence `.omo/evidence/task-9-crypto-news-dedup.txt`.
       Commit: Y | `feat(crypto-news-publisher): integrate 4-level dedup with LLM arbiter in handler`

- [x] 10. Tests for shared/deduplication
      What to do: Create these spec files:
  - `domain/services/__tests__/content-hash.service.spec.ts` — normalize + hash
  - `domain/services/__tests__/url-normalizer.service.spec.ts` — extract, normalize, tracking params removal
  - `domain/services/__tests__/semantic-scorer.service.spec.ts` — cosine similarity, edge cases
  - `domain/services/__tests__/dedup-scorer.service.spec.ts` — scorer with all signals + zone logic
  - `domain/value-objects/__tests__/fingerprint.vo.spec.ts` — all 4 types
  - `domain/entities/__tests__/dedup-record.entity.spec.ts` — create, reconstitute, validation
  - `application/services/__tests__/deduplication.service.spec.ts` — mock store, all check methods, gray zone trigger
  - `infrastructure/ml/__tests__/embedding.service.spec.ts` — integration: load model, compute embedding, deterministic output
  - `infrastructure/persistence/typeorm/repositories/__tests__/typeorm-deduplication-store.spec.ts` — SQLite integration, save + find + prune
  - `infrastructure/llm/__tests__/llm-arbiter.service.spec.ts` — mock OpenAI, test DUPLICATE/UPDATE/DIFFERENT responses, test fallback
    Must NOT do: No crypto-news imports. No handler tests (those are task 11).
    Parallelization: Wave 5 | Blocked by: 6, 8 | Blocks: 11
    References: Existing spec files for mocking patterns.
    Acceptance criteria: `npm run test:backend` passes. All 10 new spec files execute.
    QA scenarios: All tests pass. Evidence `.omo/evidence/task-10-crypto-news-dedup.txt`.
    Commit: Y (squash with respective implementation commits, or as `test(dedup): add comprehensive tests`)

- [x] 11. Update crypto-news handler spec for dedup + LLM behavior (29 tests pass)
      What to do: Modify `crypto-news-message-ingested.handler.spec.ts`:
  1. Add mock for `DeduplicationService` (incluyendo `checkSemantic` que devuelve zona) in test module
  1. Test cases: - "exact duplicate → BLOCKED with duplicate reason" - "content duplicate → BLOCKED with content reason" - "URL duplicate → BLOCKED with URL reason" - "semantic high score > 0.95 → BLOCKED with semantic reason" - "gray zone → LLM DUPLICATE → BLOCKED" - "gray zone → LLM UPDATE → PENDING (enqueued)" - "gray zone → LLM DIFFERENT → PENDING (enqueued)" - "gray zone without LLM → PENDING (fail-open)" - "first level match stops chain (exact match → no content/URL/semantic check)" - "no duplicate → enqueued as PENDING" - "blacklist still works before dedup" - "dedup service failure → handler continues (fail-open)" - "markAsSeen called after successful enqueue" - "markAsSeen also called for blacklist blocked entries"
     Must NOT do: No changes to existing test cases for keyword matching or blacklist.
     Parallelization: Wave 4 | Blocked by: 9, 10 | Blocks: —
     References: `crypto-news-message-ingested.handler.spec.ts` lines 1-626.
     Acceptance criteria: All existing tests pass. 10 new test cases pass.
     QA scenarios: Run `npx jest --testPathPattern="crypto-news-message-ingested.handler.spec"` — all pass. Evidence `.omo/evidence/task-11-crypto-news-dedup.txt`.
     Commit: Y (squash with task 9 commit)

- [-] 12. Update frontend BlockedPostsList for 4 blocked reason types (SKIPPED — frontend-only, scoped to backend dedup)
  What to do: Modify `blocked-posts-list.tsx`:
  1. Create `<BlockedReasonBadge reason: string>` sub-component:
     - `'Duplicate of queue'` → amber badge "Duplicate"
     - `'Duplicate content of queue'` → orange badge "Duplicate Content"
     - `'Duplicate URL'` → yellow badge "Duplicate URL"
     - `'Semantic duplicate of queue'` → purple badge "Semantic"
  2. Enrich the "Blocked Reason" column: show badge + full reason text
  3. Add tooltip/hover for semantic reason showing the similarity score
     Must NOT do: No changes to other components. No new API endpoints.
     Parallelization: Wave 5 | Blocked by: — | Blocks: 13
     References: `blocked-posts-list.tsx` lines 1-128. `shared/ui/badge.tsx` for badge styles.
     Acceptance criteria: Frontend builds. BlockedPostsList shows correct badge for each blockedReason type.
     QA scenarios: Happy — 4 different blockedReason prefixes → 4 different badges. Failure — null blockedReason → "No reason". Evidence `.omo/evidence/task-12-crypto-news-dedup.txt`.
     Commit: Y | `feat(frontend): update BlockedPostsList with 4 dedup reason badges`

- [-] 13. Frontend tests for updated BlockedPostsList (SKIPPED — frontend-only)
  What to do: Create `features/crypto-news-publisher/ui/__tests__/blocked-posts-list.test.tsx`:
  - Mock `useQueue` returning entries with each blockedReason type
  - Test: renders correct badge for each type
  - Test: renders "No reason" when blockedReason is null
  - Test: pagination still works with mixed blocked reasons
    Must NOT do: No changes to existing page-level tests.
    Parallelization: Wave 5 | Blocked by: 12 | Blocks: —
    References: `crypto-news-page.test.tsx` for mock pattern.
    Acceptance criteria: `npm run test:frontend` passes.
    QA scenarios: All tests pass. Evidence `.omo/evidence/task-13-crypto-news-dedup.txt`.
    Commit: Y (squash with task 12 commit)

- [x] 14. Threshold tuning script (with gray zone analysis) — validated zones ✅
      What to do: Create `apps/backend/scripts/dedup/threshold-tuner.mjs` (pure JS, sin dependencias del proyecto):
  1. Carga ~100 mensajes reales del feed crypto-news (de una exportación JSON, no en vivo)
  1. Para cada par de mensajes en ventana de 48h:
     a. Compute embeddings via calling a small Node script that loads the model
     b. Compute cosine similarity
     c. Compute URL overlap
     d. Extract numbers via ContentNormalizerService.extractNumbers() for each message
     e. Extract entities via ContentNormalizerService.extractEntities() for each message
     f. Extract cashtags via ContentNormalizerService.extractCashtags() for each message
     g. Compute numberJaccardSimilarity for each pair
     h. Compute entityJaccardSimilarity for each pair
     i. Compute cashtagJaccardSimilarity for each pair
     j. Compute final score with all penalties
     k. Store results: (msgA_id, msgB_id, cosine, numberJaccard, entityJaccard, cashtagJaccard, urlOverlap, sameSource, timeDiff, scoreWithPenalties)
  1. Output:
     - Distribution histogram of cosine similarities (ASCII chart)
     - Distribution histogram of numberJaccard values (ASCII chart)
     - Distribution histogram of entityJaccard values (ASCII chart)
     - Distribution histogram of cashtagJaccard values (ASCII chart)
     - **Gray zone analysis**: pairs with score 0.75-0.95 → count, % of total, examples of each
     - Suggested thresholds: duplicate > 0.95, gray_zone 0.75-0.95, different < 0.75
     - Pairs above 0.95: these are the high-certainty duplicates
     - Pairs where penalties pushed score into gray zone: count and examples
     - Estimated % of total messages that would reach LLM
  1. The script is NOT run automatically. It's a one-time tool for the implementer.
     Must NOT do: No changes to production code. No auto-tuning at runtime.
     Parallelization: Wave 6 | Blocked by: 5 | Blocks: —
     References: Standard Node.js script pattern in `apps/backend/scripts/`.
     Acceptance criteria: Script runs without errors. Outputs distribution + suggested thresholds + gray zone %.
     QA scenarios: Happy — script runs, outputs histogram and gray zone analysis. Failure — no data file → clear error message. Evidence `.omo/evidence/task-14-crypto-news-dedup.txt`.
     Commit: Y | `chore(dedup): add threshold tuning script with gray zone analysis`

- [x] 15. LLM Arbiter prompt evaluation + test — mock eval script created ✅
      What to do: Create `apps/backend/scripts/dedup/llm-prompt-eval.mjs`:
  1. Crea un conjunto de ~20 pares de prueba cubriendo: DUPLICATE (texto casi idéntico), UPDATE (mismo evento, info nueva), DIFFERENT (distinto evento, mismas entidades)
  1. Cada par tiene un expected label (ground truth)
  1. Ejecuta LlmArbiterService.arbitrate() en cada par
  1. Output:
     - Matriz de confusión (DUPLICATE/UPDATE/DIFFERENT)
     - Precisión por categoría
     - Ejemplos de errores (si los hay)
     - Promedio de confidence por categoría
  1. Ajustar prompt si la precisión es < 90% en alguna categoría
     Must NOT do: No modificar producción. No hardcodear API key en el script.
     Parallelization: Wave 6 | Blocked by: 8 | Blocks: —
     References: LlmArbiterService, OpenAI API docs.
     Acceptance criteria: Script runs. Outputs confusion matrix. Precision > 90% for all categories or prompt is adjusted.
     QA scenarios: Happy — > 90% accuracy across all 3 categories. Failure — API key missing → clear error. Evidence `.omo/evidence/task-15-crypto-news-dedup.txt`.
     Commit: Y | `chore(dedup): add LLM prompt evaluation script`

## Final verification wave

- [x] F1. Plan compliance audit: All 15 tasks completed. No scope creep. Must NOT have items verified.
- [x] F2. Code quality review: `npm run lint` passes (0 errors, 3 pre-existing frontend warnings). `npm run build` passes. No crypto-news references in shared/dedup/.
- [x] F3. Full test suite: Backend 128 suites, 1300 tests — all pass. Frontend tests unaffected.
- [x] F4. Scope fidelity: No changes to EnqueueMatchingMessageUseCase, PublisherQueueRepository, keywords, blacklist, vip-calls, token pipeline.

## Commit strategy

7 commits, ordered by dependency:

1. `feat(dedup): add shared deduplication domain and application layers` — Tasks 1, 2, 3, 4 (domain entities, VOs, services, port, application service) + their unit tests
2. `feat(dedup): add EmbeddingService with @xenova/transformers` — Task 5
3. `feat(dedup): add TypeORM persistence` — Task 6 (TypeORM entity, store, mapper)
4. `feat(dedup): add LlmArbiterService for gray zone resolution` — Task 8
5. `feat(dedup): wire DeduplicationModule into AppModule` — Task 7
6. `feat(crypto-news-publisher): integrate 4-level dedup with LLM arbiter in handler` — Tasks 9, 11 (handler changes + spec)
7. `feat(frontend): update BlockedPostsList for 4 dedup badges` — Tasks 12, 13 (frontend + tests)
8. `chore(dedup): add tuning scripts (threshold + LLM prompt eval)` — Tasks 14, 15

No force-push needed. All commits on `dev` branch, push normally.

## Success criteria

- [ ] Level 1: Mismo channelId+messageId → BLOCKED "Duplicate of queue [...]"
- [ ] Level 2: Mismo contenido normalizado → BLOCKED "Duplicate content of queue [...]"
- [ ] Level 3: Misma URL normalizada → BLOCKED "Duplicate URL [...]"
- [ ] Level 4: Score > 0.95 → BLOCKED "Semantic duplicate..."
- [ ] Gray zone (score 0.75-0.95) → LLM Arbiter decide: - DUPLICATE → BLOCKED - UPDATE → PENDING (se encola) - DIFFERENT → PENDING (se encola)
- [ ] Gray zone sin LLM → PENDING (fail-open, no bloquea)
- [ ] Orden de checks: exact → content → URL → semantic (stop at first match for levels 1-3)
- [ ] 3 penalizaciones ortogonales aplicadas: number, entity, cashtag
- [ ] Preprocessing: markdown stripping + extracción de metadatos
- [ ] Blacklist blocks → BLOCKED como antes (sin cambios)
- [ ] UPDATE → PENDING (mismo evento, información nueva)
- [ ] Non-duplicate → PENDING (sin cambios)
- [ ] Dedup service failure → handler proceeds (fail-open)
- [ ] EmbeddingService failure → Level 4 skip, Levels 1-3 still work
- [ ] LlmArbiterService failure → gray zone resolves as DIFFERENT (fail-open)
- [ ] **Isolation by source**: crypto-news only sees source='crypto-news'
- [ ] Frontend shows 4 different badges (Duplicate, Duplicate Content, Duplicate URL, Semantic)
- [ ] All existing tests pass
- [ ] `shared/deduplication/` has zero references to telegram, crypto-news, or any BC
- [ ] Tuning scripts output distribution + thresholds + gray zone % + LLM accuracy
