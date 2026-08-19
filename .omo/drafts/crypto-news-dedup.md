# Draft: Crypto-News Dedup (Expanded)

## Status

`writing-plan`

## Intent

CLEAR — user specified Levels 1-4 in a single phase.

## Decisions (approved)

### Shared location: `shared/deduplication/`

- Module desacoplado de cualquier BC
- `source` column aísla fingerprints por BC (crypto-news, futuros vip-calls, etc.)
- Solo integrado en crypto-news por ahora

### 4 niveles de dedup

1. **Exact match** (channelId + messageId) → DUPLICATE inmediato
2. **Content hash exacto** (SHA256 normalizado) → DUPLICATE inmediato
3. **URL match** (URLs extraídas + normalizadas: remover utm\_\*, fbclid, gclid, ref, source, campaign) → DUPLICATE inmediato
4. **Multi-señal semántico** (embedding local 384d + scorer con boosts) → DUPLICATE si score >= threshold

### Stack ML

- `@xenova/transformers` (~3MB) + `onnxruntime-node` (~10MB)
- Modelo: `all-MiniLM-L6-v2` (~80MB descarga única, cacheada)
- Inferencia local en CPU (50ms por mensaje en M1/M2)
- Cosine similarity entre vectores de 384 dimensiones
- Embedding guardado como `float8[]` en Postgres (sin extensiones)

### Scorer multi-señal (sin listas, sin datos etiquetados)

```
score_base = cosine_similarity(embedding_M, embedding_E)

boosts contextuales (sin listas externas):
  +0.15  si url_overlap(M, E) > 0
  +0.10  si misma source y timestamp_diff < 30min

score_final = min(1.0, score_base + boosts)

thresholds universales (de la literatura sentence-transformers):
  >= 0.85 → DUPLICATE semántico
  0.75-0.85 → necesita boost contextual
  < 0.75 → no duplicado
```

### Tuning sin producción

Script offline: tomar 100 mensajes reales del feed crypto-news, computar todas las cosine similarities entre pares en ventana de 48h, graficar distribución, identificar el "valle" natural. Esto se ejecuta UNA VEZ durante la implementación para fijar el threshold inicial.

### blockedReason format

```
Duplicate of queue <id> (channel: <ch>, msg: <msg>)
Duplicate content of queue <id> (channel: <ch>, msg: <msg>)
Duplicate URL <url> (original queue <id>, channel: <ch>, msg: <msg>)
Semantic duplicate of queue <id> (similarity: 0.87, source: <ch>:<msg>)
```

### Nuevos archivos / cambios

```
shared/deduplication/domain/
  services/content-hash.service.ts         (ya planeado)
  services/url-normalizer.service.ts       NUEVO
  services/semantic-scorer.service.ts      NUEVO
  services/dedup-scorer.service.ts         NUEVO (orquesta multi-señal)
  value-objects/fingerprint.vo.ts          (ya planeado)
  entities/dedup-record.entity.ts          +embedding field (float8[])

shared/deduplication/application/
  ports/deduplication-store.port.ts        +findSimilarByEmbedding method
  services/deduplication.service.ts        +checkSemantic method

shared/deduplication/infrastructure/
  ml/embedding.service.ts                  NUEVO (@xenova/transformers)
  persistence/typeorm/
    entities/dedup-record.entity.ts        +embedding column
    repositories/typeorm-deduplication-store.ts  +embedding query

  crypto-news-publisher/
    event-bus/crypto-news-message-ingested.handler.ts  MODIFICAR

  frontend/
    blocked-posts-list.tsx                 4 blockedReason types
```

### Dependencias nuevas

- `@xenova/transformers`
- `onnxruntime-node`
