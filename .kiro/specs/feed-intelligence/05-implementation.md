# Roadmap de Implementación

**Documento**: 05-implementation.md  
**Fecha**: 2026-09-25  
**Versión**: 1.0

## 🎯 Plan Faseado (5 Fases)

### Phase 1: Classification Rule-Based (1 semana)

**Objetivo**: Clasificación automática de mensajes crypto-news

**Tareas**:

1. **Setup servicio base** (1 día):
   - [ ] Crear `apps/feed-intelligence/` structure
   - [ ] Setup NestJS bootstrap (:4002)
   - [ ] Configure TypeORM + migrations
   - [ ] Health endpoint + Prometheus metrics

2. **BC Classification** (2 días):
   - [ ] Domain entities: `ClassifiedNews`
   - [ ] Value objects: `NewsCategory` (17 categorías)
   - [ ] `RuleBasedClassifierAdapter` con regex patterns
   - [ ] `ClassifyNewsMessageUseCase`
   - [ ] TypeORM repository + migrations

3. **Integration** (1 día):
   - [ ] `ClassificationCronScheduler` (every 30s)
   - [ ] HTTP client para ingestion-telegram
   - [ ] Fetch unclassified messages
   - [ ] Persist classifications

4. **Testing** (1 día):
   - [ ] Unit tests: rule-based classifier (100+ casos)
   - [ ] Integration tests: classification pipeline
   - [ ] E2E test: clasificar mensaje real

5. **Deployment** (1 día):
   - [ ] Create DB `alpha_meta_token_scanner_intelligence`
   - [ ] Run migrations
   - [ ] Deploy container on Oracle VPS
   - [ ] Verify classification running

**Success Criteria**:

- ✅ Clasificación automática de 80%+ mensajes
- ✅ Confidence >= 0.85 en 60%+ casos
- ✅ Latency < 100ms per message (rule-based)
- ✅ Zero downtime del pipeline existente

---

### Phase 2: Clustering (3 días)

**Objetivo**: Detectar mensajes similares/duplicados

**Tareas**:

1. **LLM Gateway setup** (1 día):
   - [ ] Crear `apps/llm-gateway/` structure
   - [ ] Download bge-small-en-v1.5 ONNX model (~120 MB)
   - [ ] `OnnxEmbeddingsService` implementation
   - [ ] Endpoints: `/embeddings/embed`, `/embeddings/similarity`
   - [ ] Health check + metrics
   - [ ] Deploy standalone on :4001

2. **BC Clustering** (1 día):
   - [ ] Domain entities: `NewsCluster`
   - [ ] `ClusteringOrchestratorService`
   - [ ] Integrate with llm-gateway client
   - [ ] Threshold 0.7 (más permisivo que dedup 0.85)
   - [ ] TypeORM repository + migrations

3. **Scheduler** (0.5 día):
   - [ ] `ClusteringCronScheduler` (every 5 min)
   - [ ] Batch process últimas 24h
   - [ ] Persist clusters con 2+ miembros

4. **Testing** (0.5 día):
   - [ ] Unit tests: similarity computation
   - [ ] Integration test: clustering batch
   - [ ] E2E test: detect duplicates

**Success Criteria**:

- ✅ Clustering detecta 90%+ duplicados reales
- ✅ False positive rate < 10%
- ✅ Batch processing < 60s para 500 mensajes
- ✅ LLM Gateway latency < 100ms per embed

---

### Phase 3: Ranking + Aggregation (4 días)

**Objetivo**: Re-ranking inteligente + templates de contenido agregado

**Tareas**:

1. **BC Ranking** (1 día):
   - [ ] `ScoringFormulaService` (5 dimensiones)
   - [ ] `RankNewsFeedUseCase`
   - [ ] In-memory cache (TTL 5 min)
   - [ ] API endpoint: `GET /ranking/feed`

2. **BC Aggregation** (2 días):
   - [ ] Domain entities: `NewsDigest`, `DigestTemplate`
   - [ ] Use cases:
     - [ ] `GenerateHourlyHighlightsUseCase`
     - [ ] `GenerateBreakingNewsAlertUseCase`
   - [ ] `TemplateRendererService`
   - [ ] Emoji mapping por categoría
   - [ ] TypeORM repository + migrations

3. **Schedulers** (0.5 día):
   - [ ] `HourlyDigestScheduler` (every hour)
   - [ ] `BreakingNewsScheduler` (every 15 min, conditional)

4. **Testing** (0.5 día):
   - [ ] Unit tests: scoring formula (property-based)
   - [ ] Unit tests: template rendering
   - [ ] Integration test: digest generation
   - [ ] E2E test: ranked feed API

**Success Criteria**:

- ✅ Ranking score correlates con relevancia manual (80%+ agreement)
- ✅ Hourly digest tiene 3-5 entradas consistentemente
- ✅ Breaking news threshold 85+ NO false alarms
- ✅ Render latency < 200ms per digest

---

### Phase 4: LLM Refinement (opcional, 2 días)

**Objetivo**: Clasificación LLM como fallback (SOLO si rule-based < 80% accuracy)

**Tareas**:

1. **LLM Classifier** (1 día):
   - [ ] `LlmNewsClassifierAdapter`
   - [ ] Prompt engineering para clasificación
   - [ ] Integrate con LiteLLM gateway existente
   - [ ] Fallback chain: rule-based → LLM si confidence < 0.85

2. **Config + Monitoring** (0.5 día):
   - [ ] Feature flag `useLlmClassifier` (default: false)
   - [ ] Cost tracking (LLM API calls)
   - [ ] Budget alerts (>$5/day)

3. **Testing** (0.5 día):
   - [ ] Unit tests: LLM classifier
   - [ ] E2E test: hybrid classification
   - [ ] Validate cost per message

**Success Criteria**:

- ✅ LLM accuracy >= 90% en casos ambiguos
- ✅ Blended accuracy >= 85%
- ✅ Cost < $0.50/day

**Decision Point**: Solo implementar si rule-based < 80% accuracy tras Phase 1

---

### Phase 4: Cluster Synthesis (1 semana) **NUEVO v2.0**

**Objetivo**: LLM merge duplicates en lugar de descartarlos

**Tareas**:

1. **ClusterSynthesisService** (2 días):
   - [ ] Domain entity: `ClusterSynthesis`
   - [ ] `ClusterSynthesisService.synthesizeCluster()`
   - [ ] Build synthesis prompt (template con variables)
   - [ ] LLM Gateway client integration (chat endpoint)
   - [ ] Cache 24h para evitar re-synthesis
   - [ ] TypeORM repository + migrations

2. **Integration con Ranking** (1 día):
   - [ ] `applySynthesis()` method en ranking use case
   - [ ] Replace cluster members con synthesized version
   - [ ] Preserve metadata (clusterSize, sources)

3. **Template Config** (1 día):
   - [ ] Add `clusterSynthesis` config to TemplateConfig VO
   - [ ] Validation logic (minClusterSize >= 2)
   - [ ] Frontend UI toggle para enable/disable

4. **Testing** (1 día):
   - [ ] Unit tests: synthesis prompt building
   - [ ] Integration test: 3 duplicates → 1 synthesized
   - [ ] E2E test: hourly highlights con synthesis
   - [ ] Cost tracking assertions

**Success Criteria**:

- ✅ Synthesis quality >= 90% (manual review 20 samples)
- ✅ Cache hit rate >= 70%
- ✅ Latency < 3s per synthesis
- ✅ Cost < $0.03/día

---

### Phase 5: Story Tracking (1.5 semanas) **NUEVO v2.0**

**Objetivo**: Detectar updates de historias existentes + timeline

**Tareas**:

1. **NewsStory Domain** (2 días):
   - [ ] Domain entity: `NewsStory`
   - [ ] Value objects: `StoryUpdate`, `UpdateType` enum
   - [ ] `NewsStory.addUpdate()` method
   - [ ] `NewsStory.isRelated()` similarity logic
   - [ ] TypeORM repository + migrations (con embedding column)

2. **StoryTrackerService** (3 días):
   - [ ] `processMessage()` — detect if update or new story
   - [ ] Embedding similarity search (threshold 0.75)
   - [ ] `detectUpdateType()` heuristic (keywords + LLM opcional)
   - [ ] `extractNewInfo()` — LLM compara con historia previa
   - [ ] `generateStoryTitle()` — entidad extraction

3. **Story Update Renderer** (1 día):
   - [ ] `StoryUpdateRenderer.render()`
   - [ ] Timeline formatting con iconos por update type
   - [ ] `synthesizeStoryHistory()` — LLM consolida toda la historia
   - [ ] Template: "Story Update Narrative"

4. **Integration** (1 día):
   - [ ] Hook en classification pipeline → story tracker
   - [ ] Enrich ranked news con `storyContext`
   - [ ] Narrative template usa story data

5. **Testing** (1.5 días):
   - [ ] Unit tests: story detection logic
   - [ ] Unit tests: update type classification
   - [ ] Integration test: 3 updates tracked correctamente
   - [ ] E2E test: narrative template con stories

**Success Criteria**:

- ✅ Story detection accuracy >= 85% (manual review)
- ✅ Update type classification accuracy >= 80%
- ✅ Timeline rendering correcto (cronológico, no duplicados)
- ✅ Cost < $0.005/día

---

### Phase 6: Content-Publisher Integration (2 días)

**Tareas**:

1. **Daily Digest** (1 día):
   - [ ] `GenerateDailyDigestUseCase`
   - [ ] Group by category
   - [ ] `DailyDigestScheduler` (8 AM UTC)
   - [ ] Renderer con subsecciones

2. **Category Deep Dive** (1 día):
   - [ ] `GenerateCategoryDeepDiveUseCase`
   - [ ] On-demand API endpoint
   - [ ] Trend detection (keyword frequency over time)
   - [ ] Top sources por categoría

3. **Trending Topics** (2 días):
   - [ ] Real-time cluster tracking
   - [ ] Topic naming (LLM-based)
   - [ ] `GET /aggregation/trending` endpoint
   - [ ] Frontend integration (updates cada hora)

4. **Content-Publisher Integration** (1 día):
   - [ ] `DigestPublishScheduler` en content-publisher
   - [ ] Fetch latest digest from intelligence
   - [ ] Queue para Bot API
   - [ ] Publish hourly/daily/breaking

**Success Criteria**:

- ✅ Daily digest tiene 8-10 entradas bien distribuidas
- ✅ Category deep dive genera insights útiles
- ✅ Trending topics refresh < 30s lag
- ✅ Content-publisher publishes digests sin intervención manual

---

## 🧪 Testing Strategy

### Unit Tests

**Coverage target**: 80%+

**Áreas críticas**:

1. **RuleBasedClassifier**:
   - 100+ test cases (10+ por categoría)
   - Edge cases: empty content, multi-match, no-match
   - Confidence computation bounds

2. **ScoringFormula**:
   - Property-based testing (score bounds 0-100)
   - Monotonicity: mejor inputs → mejor score
   - Edge cases: zero media, extreme age, cluster size 1

3. **TemplateRenderer**:
   - Snapshot tests para cada template
   - Emoji mapping completo
   - Truncation logic (150 chars)

### Integration Tests

**Flujos completos**:

1. **Classification pipeline**:
   - Fetch unclassified → classify → persist → verify
   - Verify idempotency (re-run no duplica)

2. **Clustering pipeline**:
   - Fetch recent → compute similarity → group → persist
   - Verify cluster representatives son correctos

3. **Ranking pipeline**:
   - Fetch RAW → join classifications → join clusters → score → sort
   - Verify order es correcto

4. **Aggregation pipeline**:
   - Fetch ranked → render template → persist digest
   - Verify content formatting

### E2E Tests

**Endpoints**:

1. `GET /health` → 200 OK
2. `GET /classification/stats` → valid category distribution
3. `GET /clustering/recent` → lista de clusters
4. `GET /ranking/feed?category=listing&minScore=70` → ranked feed
5. `GET /aggregation/digest/latest` → latest digest

**Criterios**:

- Response time < 500ms (ranking puede ser más lento)
- No 500 errors
- Schema validation (Zod)

### Performance Tests

**Benchmarks**:

1. **Classification**: 100 messages/s (rule-based)
2. **Clustering**: 500 messages en <60s (batch)
3. **Ranking**: 100 messages en <500ms (on-read)
4. **Embedding**: 32 texts en <800ms (batch)

**Load testing**:

```bash
# Artillery config
scenarios:
  - flow:
    - get:
        url: "/ranking/feed?limit=50"
    - think: 1
    - get:
        url: "/classification/stats"

# Expected: 95th percentile < 1s
```

---

## 📊 Success Criteria (Global)

### Funcionales

| Criterio                | Target | Verificación                        |
| ----------------------- | ------ | ----------------------------------- |
| Classification accuracy | 80%+   | Manual validation 100 samples       |
| Clustering precision    | 90%+   | False positive rate <10%            |
| Ranking correlation     | 80%+   | Agreement con ranking manual        |
| Digest completeness     | 80%+   | Tienen 3+ entradas consistentemente |

### No-Funcionales

| Criterio               | Target | Verificación   |
| ---------------------- | ------ | -------------- |
| Classification latency | <100ms | Prometheus p95 |
| Clustering batch time  | <60s   | Logs scheduler |
| Ranking query time     | <500ms | API p95        |
| LLM Gateway memory     | <1.2GB | Docker stats   |
| Intelligence memory    | <100MB | Docker stats   |

### Operacionales

| Criterio             | Target         | Verificación           |
| -------------------- | -------------- | ---------------------- |
| Uptime               | 99.5%          | Healthcheck logs       |
| Error rate           | <1%            | Prometheus error_total |
| Zero downtime deploy | Yes            | Blue-green deployment  |
| Monitoring coverage  | 100% endpoints | Prometheus metrics     |

---

## 💰 Cost Analysis (v2.0 Updated)

### Infraestructura

**Self-hosted (ONNX)**:

- RAM: 1.1 GB adicional (dentro de 7.2 GB disponibles)
- Disk: 300 MB (models)
- **Costo mensual**: $0 (ya tenemos el VPS)

**Alternativa OpenAI Embeddings** (descartada):

- 65 msgs/día × 200 tokens × 30 días = 400K tokens/mes
- $0.02 per 1M tokens
- **Costo mensual**: ~$0.008

### LLM Classification (Phase 4, opcional)

**Si activamos LLM fallback**:

- Casos ambiguos: ~15% de 65 msgs/día = 10 msgs/día
- LiteLLM deepseek-v4-flash: ~$0.001 per 1K tokens
- 10 msgs × 300 tokens × 30 días = 90K tokens/mes
- **Costo mensual**: ~$0.09

### Cluster Synthesis (Phase 4) **NUEVO v2.0**

**LLM synthesis de duplicados**:

- ~150 tokens per synthesis
- Asumiendo 5 clusters/hora × 24h = 120 síntesis/día
- 120 × 150 = 18K tokens/día = 540K tokens/mes
- deepseek-v4-flash: ~$0.001 per 1K tokens
- **Costo mensual**: ~$0.54

**Savings from synthesis**:

- Sin synthesis: publicar 3 duplicados separados = 3× engagement dilution
- Con synthesis: 1 mensaje comprehensive = mejor engagement
- ROI: mejor calidad de contenido > $0.54/mes

### Story Tracking (Phase 5) **NUEVO v2.0**

**LLM para story tracking**:

- Extract new info: ~100 tokens per update (10 updates/día)
- Synthesize history: ~250 tokens per story (5 síntesis/día)
- (10 × 100) + (5 × 250) = 2,250 tokens/día = 67.5K tokens/mes
- **Costo mensual**: ~$0.07

### Totals

**Phase 1-3** (Basic): $0/mes (self-hosted embeddings only)  
**Phase 4** (+ LLM classification): <$0.10/mes  
**Phase 5** (+ Cluster Synthesis): +$0.54/mes  
**Phase 6** (+ Story Tracking): +$0.07/mes

**Total con todas las features v2.0**: ~**$0.80/mes**

**Comparación**:

- OpenAI embeddings API: $50-100/mes (similar volumen)
- Self-hosted approach: $0.80/mes
- **Savings**: >$600/year

---

## 🚀 Deployment Checklist

### Pre-Deploy

- [ ] Review code (PR + approval)
- [ ] Run full test suite (backend + intelligence)
- [ ] Run migrations dry-run
- [ ] Backup production DB
- [ ] Verify VPS resources (RAM < 70%)

### Deploy

1. **LLM Gateway** (Phase 2):

   ```bash
   # Build image
   docker build -t ghcr.io/your-org/llm-gateway:latest apps/llm-gateway

   # Deploy
   docker-compose -f docker-compose.llm-gateway.yml up -d

   # Verify
   curl http://localhost:4001/health
   ```

2. **Intelligence Service** (Phase 1, 3, 5):

   ```bash
   # Create DB
   psql -U alpha_meta_token_scanner -c "CREATE DATABASE alpha_meta_token_scanner_intelligence;"

   # Run migrations
   cd apps/ingestion-intelligence
   npm run migration:run

   # Build image
   docker build -t ghcr.io/your-org/ingestion-intelligence:latest .

   # Deploy
   docker-compose -f docker-compose.intelligence.yml up -d

   # Verify
   curl http://localhost:4002/health
   curl http://localhost:4002/classification/stats
   ```

3. **Backend Integration** (Phase 2):
   ```bash
   # Update DeduplicationModule
   # Deploy backend via normal workflow
   git push origin master
   ```

### Post-Deploy

- [ ] Verify all services healthy
- [ ] Check classification running (logs)
- [ ] Check clustering running (logs)
- [ ] Verify digests generating (DB query)
- [ ] Monitor memory usage (24h)
- [ ] Monitor error rate (24h)

### Rollback Plan

**If issues detected**:

1. **Stop new service**:

   ```bash
   docker-compose -f docker-compose.intelligence.yml down
   ```

2. **Revert migrations** (if needed):

   ```bash
   cd apps/ingestion-intelligence
   npm run migration:revert
   ```

3. **Backend continues working** (fail-open design)

---

## 📈 Monitoring & Alerts

### Prometheus Metrics

```typescript
// Classification
intelligence_classifications_total{category}
intelligence_classification_duration_seconds
intelligence_classification_confidence_score

// Clustering
intelligence_clusters_created_total
intelligence_clustering_duration_seconds

// Ranking
intelligence_ranking_queries_total
intelligence_ranking_duration_seconds

// Aggregation
intelligence_digests_generated_total{template}
intelligence_digest_entries_count

// LLM Gateway
llm_gateway_embeddings_total
llm_gateway_embeddings_duration_seconds
llm_gateway_memory_usage_bytes
```

### Alerts

**Critical**:

```yaml
- alert: IntelligenceServiceDown
  expr: up{job="ingestion-intelligence"} == 0
  for: 5m
  annotations:
    summary: Intelligence service is down

- alert: LlmGatewayDown
  expr: up{job="llm-gateway"} == 0
  for: 5m
  annotations:
    summary: LLM Gateway is down
```

**Warning**:

```yaml
- alert: HighMemoryUsage
  expr: container_memory_usage_bytes{name=~"llm-gateway|ingestion-intelligence"} > 1.4e9
  for: 10m
  annotations:
    summary: High memory usage detected

- alert: ClassificationBacklog
  expr: intelligence_unclassified_messages_total > 1000
  for: 15m
  annotations:
    summary: Classification backlog growing

- alert: SlowClustering
  expr: intelligence_clustering_duration_seconds > 120
  for: 5m
  annotations:
    summary: Clustering taking too long
```

---

## 🎓 Learning from Production Data

**Key insights desde datos reales (291 mensajes, 72h)**:

1. **Volumen manejable**: 65 msgs/día = fácil de procesar en tiempo real
2. **Fuentes concentradas**: Top 5 fuentes = 90%+ del volumen
3. **Breaking news dominant**: 40% del contenido es urgente → priorizar Breaking News template
4. **Regulatory heavy**: 35% regulatory/legal combined → alta demanda de filtros por categoría
5. **Media sparse**: 70% text-only → NO necesitamos procesamiento pesado de imágenes

**Ajustes al plan**:

- ✅ Phase 1 prioridad Breaking News template (era Phase 2 originalmente)
- ✅ Rule-based suficiente para 80%+ (patrones muy claros)
- ✅ Self-hosted embeddings viables (volumen bajo, <100 embeds/día)
- ✅ Clustering threshold 0.7 correcto (detectamos duplicados obvios sin over-cluster)

---

**Ver documentos relacionados**:

- [01-overview.md](./01-overview.md) — Visión general y motivación
- [02-architecture.md](./02-architecture.md) — Diseño técnico detallado
- [03-infrastructure.md](./03-infrastructure.md) — VPS, LLM Gateway, deployment
- [04-content-templates.md](./04-content-templates.md) — Templates con ejemplos reales
