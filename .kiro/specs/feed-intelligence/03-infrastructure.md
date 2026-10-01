# Infraestructura y Deployment

**Documento**: 03-infrastructure.md  
**Fecha**: 2026-09-25  
**Versión**: 1.0

## 🖥️ Análisis del VPS (OracleDroplet)

### Recursos Disponibles

**Hardware**:

- **CPU**: 2 cores (Neoverse-N1, ARM64)
- **RAM**: 12 GB total
  - Usada actual: 4.5 GB
  - **Disponible**: 7.2 GB
- **Disk**: 45 GB total
  - Usado: 21 GB (47%)
  - **Disponible**: 24 GB
- **GPU**: ❌ No disponible (CPU-only)
- **Swap**: 0 GB

**Contenedores activos**:

- `onchain-bot-backend` (~500MB RAM)
- `onchain-bot-ingestion-telegram` (~400MB RAM)
- `onchain-bot-postgres-production` (~800MB RAM)
- `onchain-bot-redis-production` (~50MB RAM)
- Frontend nginx (minimal)

**RAM libre para nuevos servicios**: ~3-4 GB ✅

## 🤖 LLM Infrastructure Existente

### Backend LLM Module

**Arquitectura actual** (`apps/backend/src/shared/llm/`):

```typescript
// LlmPort (abstracción)
interface LlmPort {
  generateText(request: {
    prompt: string;
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    imageUrl?: string;
    imageBase64?: string;
  }): Promise<string>;

  isAvailable(): Promise<boolean>;
}

// Adapters disponibles
- LlmGatewayAdapter  // LiteLLM proxy (OpenAI-compatible)
- OpenAiAdapter      // Direct OpenAI SDK
- MockLlmAdapter     // Testing/dev sin costo

// Priority cascade
1. LLM_GATEWAY_BASE_URL + API_KEY → LlmGatewayAdapter
2. OPENAI_API_KEY → OpenAiAdapter
3. Default → MockLlmAdapter
```

**Crypto-News Publisher**:

- 3-flag control: `matchingEnabled`, `llmEnabled`, `publishingEnabled`
- LLM generation SOLO cuando `llmEnabled=true AND publishingEnabled=true`

### Deduplication Service (Backend)

**Estado actual**:

```typescript
// Interfaces definidas pero NO implementadas
interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

interface LlmArbiterService {
  classifyRelation(textA: string, textB: string, similarity: number):
    Promise<{ relation: 'duplicate' | 'update' | 'different'; confidence: number }>;
}

// Comportamiento
- @Optional() @Inject('EMBEDDING_SERVICE')
- @Optional() @Inject('LLM_ARBITER_SERVICE')
- **Fail-open**: sin implementación, skip semantic layer
```

## 🚀 Propuesta: apps/llm-gateway/

### Rationale

**Nuevo servicio centralizado** para toda inferencia ML/LLM:

1. **Separación de responsabilidades**:
   - Backend → lógica de negocio
   - LLM Gateway → inferencia ML (embeddings, clasificación, reranking)

2. **Consumidores múltiples (crypto-news only)**:
   - `feed-intelligence` → embeddings para clustering de crypto-news
   - Futuro: Backend → semantic deduplication (crypto-news, NOT KOL)
   - Futuro: Content-publisher → matching de crypto-news
   - **NO involucrado**: KOL system, alpha-call pipeline, telegram-kol ingestion

3. **Self-hosted**:
   - ONNX runtime (CPU-optimized)
   - Zero recurring cost
   - <100ms latency (vs 200-500ms APIs externas)
   - Control total sobre modelos

### Arquitectura

```
apps/llm-gateway/
├── src/
│   ├── embeddings/
│   │   ├── embeddings.module.ts
│   │   ├── embeddings.controller.ts          # POST /embeddings/embed
│   │   └── onnx-embeddings.service.ts        # bge-small-en-v1.5
│   ├── classification/
│   │   ├── classification.controller.ts      # POST /classify/text
│   │   └── llm-classifier.service.ts         # LiteLLM fallback
│   ├── reranking/ (Phase 4)
│   │   ├── reranking.controller.ts           # POST /rerank/pairs
│   │   └── bge-reranker.service.ts
│   ├── health/
│   │   └── health.controller.ts              # GET /health
│   └── main.ts                               # :4001
├── models/ (gitignored)
│   ├── bge-small-en-v1.5/
│   │   ├── model.onnx (~120 MB)
│   │   ├── tokenizer.json
│   │   └── config.json
│   └── bge-reranker-base/ (opcional)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Endpoints

**POST /embeddings/embed**:

```json
Request:
{
  "texts": ["texto 1", "texto 2", ...],  // Batch hasta 32
  "normalize": true                       // L2 normalization
}

Response:
{
  "embeddings": [[0.1, 0.2, ...], ...],
  "dimensions": 384
}
```

**POST /embeddings/similarity**:

```json
Request:
{
  "textA": "...",
  "textB": "..."
}

Response:
{
  "similarity": 0.85,
  "method": "cosine"
}
```

**POST /classify/text** (Phase 4, LLM fallback):

```json
Request:
{
  "text": "...",
  "categories": ["listing", "airdrop", "hack"],  // Optional
  "useLlm": false                                // Default rule-based
}

Response:
{
  "category": "listing",
  "confidence": 0.92,
  "method": "rule-based",
  "subcategories": ["partnership"]
}
```

**GET /health**:

```json
{
  "status": "healthy",
  "services": {
    "embeddings": {
      "loaded": true,
      "model": "bge-small-en-v1.5",
      "dimensions": 384
    },
    "classification": { "loaded": true },
    "reranking": { "loaded": false }
  },
  "memory": {
    "used": "450MB",
    "available": "3.2GB"
  }
}
```

### Modelo Recomendado: bge-small-en-v1.5

**Opciones evaluadas (CPU-only)**:

| Modelo                | Dims    | RAM       | Latency  | Calidad      |
| --------------------- | ------- | --------- | -------- | ------------ |
| all-MiniLM-L6-v2      | 384     | 100MB     | 50ms     | ⭐⭐⭐       |
| all-mpnet-base-v2     | 768     | 420MB     | 150ms    | ⭐⭐⭐⭐     |
| **bge-small-en-v1.5** | **384** | **120MB** | **60ms** | **⭐⭐⭐⭐** |

**Selección: bge-small-en-v1.5**

- ✅ Optimizado para CPU (ONNX runtime)
- ✅ Best accuracy/speed tradeoff
- ✅ 384 dims = clustering rápido
- ✅ Ya tenemos `onnxruntime-node` en deps

### Deployment

**docker-compose.llm-gateway.yml**:

```yaml
services:
  llm-gateway:
    build: ./apps/llm-gateway
    container_name: onchain-bot-llm-gateway
    ports:
      - '127.0.0.1:4001:4001'
    environment:
      - NODE_ENV=production
      - PORT=4001
      - LOG_LEVEL=info
      - MODELS_PATH=/app/models
      - ENABLE_RERANKING=false # Phase 4
    volumes:
      - ./apps/llm-gateway/models:/app/models:ro
    restart: unless-stopped
    mem_limit: 1.5g
    cpus: 1.5
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4001/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

**Dockerfile** (multi-stage):

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Models are mounted as volume (not in image)
VOLUME ["/app/models"]

EXPOSE 4001
CMD ["node", "dist/main.js"]
```

### Estimación de Recursos

**LLM Gateway**:

- **RAM**: 800 MB - 1.2 GB
  - ONNX model: ~120 MB
  - Runtime: ~200 MB
  - Batch buffer: ~500 MB
- **CPU**: ~20-30% de 1 core durante inferencia
- **Disk**: ~300 MB (model files)

**Intelligence Service**:

- **RAM**: ~50 MB (sin embeddings locales)
- Comunicación con llm-gateway via HTTP

**Total overhead**: ~1.1 GB RAM + 300 MB disk

**Balance post-deploy**:

- RAM actual disponible: 7.2 GB
- RAM usada nueva: 1.1 GB
- **RAM libre restante**: ~6 GB ✅ Suficiente

### Performance

**Latencies esperadas**:

- Single embedding: ~60ms
- Batch 32 embeddings: ~800ms
- Similarity computation: ~5ms (cosine)
- Classification (rule-based): ~5ms
- Classification (LLM fallback): ~2s

## 🔄 Integración con Servicios Existentes

### Consumidores

**1. feed-intelligence** (primary):

```typescript
// shared/clients/llm-gateway-client.service.ts
@Injectable()
export class LlmGatewayClientService {
  constructor(
    private readonly httpService: HttpService,
    @Inject('LLM_GATEWAY_URL') private readonly baseUrl: string,
  ) {}

  async computeSimilarity(
    textA: string,
    textB: string,
  ): Promise<{ similarity: number }> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/embeddings/similarity`, {
        textA,
        textB,
      }),
    );
    return response.data;
  }

  async embedBatch(texts: string[]): Promise<{ embeddings: number[][] }> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/embeddings/embed`, {
        texts,
        normalize: true,
      }),
    );
    return response.data;
  }
}
```

**2. Futuro: Backend** (semantic deduplication para crypto-news):

```typescript
// Implementación de EmbeddingService (crypto-news only, NO KOL)
@Injectable()
export class LlmGatewayEmbeddingService implements EmbeddingService {
  constructor(private readonly llmGatewayClient: LlmGatewayClientService) {}

  async embed(text: string): Promise<number[]> {
    const result = await this.llmGatewayClient.embedBatch([text]);
    return result.embeddings[0];
  }
}

// Registrar en DeduplicationModule (crypto-news only)
@Module({
  providers: [
    {
      provide: 'EMBEDDING_SERVICE',
      useClass: LlmGatewayEmbeddingService,
    },
  ],
})
export class DeduplicationModule {}
```

**3. Content-Publisher** (futuro):

- Semantic matching para publisher queue (crypto-news)
- Deduplicación pre-publish

**IMPORTANTE**: LLM Gateway es específico para crypto-news. El sistema KOL NO usa embeddings ni clasificación ML.

## 📊 Alternativa Descartada: OpenAI Embeddings API

**Costo estimado**:

- Modelo: `text-embedding-3-small` (1536 dims)
- Precio: $0.02 per 1M tokens
- Volumen: 65 msgs/día × 200 tokens avg × 30 días = ~400K tokens/mes
- **Costo mensual**: ~$0.008/mes

**Razones para descartar**:

1. **Latencia**: 200-500ms (vs <100ms self-hosted)
2. **Dependencia externa**: SLA de OpenAI
3. **Dimensiones**: 1536 dims (vs 384, 4× más pesado para clustering)
4. **Control**: No control sobre modelo ni updates

**Recomendación**: Self-hosted ONNX (control total, zero recurring cost, mejor latency)

## 🗄️ Database

### Intelligence Service

**Nueva base de datos**: `alpha_meta_token_scanner_intelligence`

**Separada de ingestion-telegram** (no compartir):

- Mismo servidor PostgreSQL
- Conexión independiente
- Migraciones propias

**Conexión**:

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=alpha_meta_token_scanner_intelligence
DATABASE_USER=alpha_meta_token_scanner
DATABASE_PASSWORD=alpha_meta_token_scanner
DATABASE_SYNCHRONIZE=false  # Prod/staging
DATABASE_LOGGING=false
```

## 🚢 Deployment Strategy

### Phase 1: LLM Gateway

1. **Setup models**:

   ```bash
   mkdir -p apps/llm-gateway/models/bge-small-en-v1.5
   # Download model files (ONNX, tokenizer, config)
   ```

2. **Build image**:

   ```bash
   docker build -t ghcr.io/your-org/llm-gateway:latest apps/llm-gateway
   ```

3. **Deploy standalone**:

   ```bash
   docker-compose -f docker-compose.llm-gateway.yml up -d
   ```

4. **Health check**:
   ```bash
   curl http://localhost:4001/health
   ```

### Phase 2: Intelligence Service

1. **Create DB**:

   ```sql
   CREATE DATABASE alpha_meta_token_scanner_intelligence
     OWNER alpha_meta_token_scanner;
   ```

2. **Run migrations**:

   ```bash
   cd apps/feed-intelligence
   npm run migration:run
   ```

3. **Deploy service**:

   ```bash
   docker-compose -f docker-compose.intelligence.yml up -d
   ```

4. **Verify endpoints**:
   ```bash
   curl http://localhost:4002/health
   curl http://localhost:4002/classification/stats
   ```

### Phase 3: Backend Integration

1. **Update DeduplicationModule**:
   - Register `LlmGatewayEmbeddingService`
   - Set `EMBEDDING_SERVICE` provider

2. **Deploy backend**:
   ```bash
   # Normal deploy workflow
   git push origin master
   ```

## 📈 Monitoring

**Prometheus metrics**:

```
# LLM Gateway
llm_gateway_embeddings_total
llm_gateway_embeddings_duration_seconds
llm_gateway_memory_usage_bytes

# Intelligence Service
intelligence_classifications_total
intelligence_clusters_created_total
intelligence_ranking_queries_total
intelligence_digests_generated_total
```

**Alerts**:

- Memory usage > 1.4GB → warning
- Embedding latency > 200ms → investigate
- Classification backlog > 1000 → scale up

---

**Ver documentos relacionados**:

- [01-overview.md](./01-overview.md) — Visión general
- [02-architecture.md](./02-architecture.md) — Diseño de BCs
- [04-content-templates.md](./04-content-templates.md) — Templates
- [05-implementation.md](./05-implementation.md) — Roadmap
