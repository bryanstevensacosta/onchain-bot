# Propuesta: Sistema de Clasificación, Clustering y Re-Ranking para Crypto-News

**Autor**: AI Assistant  
**Fecha**: 2026-09-25  
**Estado**: Propuesta  
**Versión**: 1.0

## 🎯 Visión General

El sistema procesará los mensajes RAW de crypto-news en tres etapas:

1. **Clasificación** → Taxonomía semántica (airdrop, IDO, partnership, hack, etc.)
2. **Clustering** → Agrupación de contenido similar/duplicado
3. **Re-Ranking** → Priorización por relevancia, novedad y engagement potencial

## 🏗️ Arquitectura Propuesta

### Ubicación en el Monorepo

```
apps/backend/src/telegram/crypto-news-intelligence/
├── core/
│   ├── crypto-news-intelligence.module.ts
│   └── config/intelligence.config.ts
├── classification/
│   ├── domain/
│   │   ├── entities/classified-news.entity.ts
│   │   ├── value-objects/news-category.vo.ts
│   │   └── events/news-classified.event.ts
│   ├── application/
│   │   ├── use-cases/classify-news-message.use-case.ts
│   │   ├── ports/news-classifier.port.ts
│   │   └── services/taxonomy.service.ts
│   └── infrastructure/
│       ├── adapters/llm-news-classifier.adapter.ts
│       ├── adapters/rule-based-classifier.adapter.ts
│       └── persistence/classified-news.repository.ts
├── clustering/
│   ├── domain/
│   │   ├── entities/news-cluster.entity.ts
│   │   └── value-objects/similarity-score.vo.ts
│   ├── application/
│   │   ├── use-cases/cluster-similar-news.use-case.ts
│   │   ├── ports/similarity-detector.port.ts
│   │   └── services/deduplication-orchestrator.service.ts
│   └── infrastructure/
│       ├── adapters/semantic-similarity.adapter.ts
│       ├── adapters/url-overlap-detector.adapter.ts
│       └── persistence/news-cluster.repository.ts
├── ranking/
│   ├── domain/
│   │   ├── entities/ranked-news.entity.ts
│   │   └── value-objects/relevance-score.vo.ts
│   ├── application/
│   │   ├── use-cases/rank-news-feed.use-case.ts
│   │   ├── ports/news-ranker.port.ts
│   │   └── services/scoring-formula.service.ts
│   └── infrastructure/
│       ├── adapters/ml-ranker.adapter.ts
│       └── persistence/ranked-news.repository.ts
└── api/
    ├── controllers/intelligence.controller.ts
    └── dto/intelligence-query.dto.ts
```

### Integración con el Pipeline Existente

```typescript
// En MessageRoutingService, agregar ruta para intelligence
private async routeToCryptoNewsIntelligence(
  message: RawTelegramMessage,
): Promise<void> {
  try {
    // 1. Clasificación (async, no-blocking)
    await this.classifyNewsUseCase.execute({
      channelId: message.peerId,
      messageId: message.id,
      content: message.text || '',
      occurredAt: message.date,
    });

    // 2. Clustering se ejecuta en batch (scheduler cada 5 min)
    // 3. Re-ranking se aplica on-read en queries del frontend
  } catch (error) {
    this.logger.error(`Intelligence processing failed`, error);
    // Fail-open: el mensaje sigue su pipeline normal
  }
}
```

## 📊 Componente 1: Clasificación

### Taxonomía de Categorías

```typescript
// classification/domain/value-objects/news-category.vo.ts
export enum NewsCategory {
  // Market Events
  LISTING = 'listing', // CEX/DEX listings
  AIRDROP = 'airdrop', // Token distribution
  IDO_ICO = 'ido_ico', // Initial offerings

  // Business
  PARTNERSHIP = 'partnership', // Collaborations
  FUNDING = 'funding', // Investment rounds
  PRODUCT_LAUNCH = 'product_launch',

  // Security
  HACK_EXPLOIT = 'hack_exploit',
  RUG_PULL = 'rug_pull',
  AUDIT = 'audit',

  // Market Analysis
  PRICE_MOVEMENT = 'price_movement',
  WHALE_ACTIVITY = 'whale_activity',
  VOLUME_SPIKE = 'volume_spike',

  // Regulatory
  REGULATION = 'regulation',
  LEGAL = 'legal',

  // Community
  AMA = 'ama',
  CONTEST = 'contest',

  // Meta
  GENERAL_NEWS = 'general_news',
  SPAM = 'spam',
}

export interface NewsClassificationResult {
  category: NewsCategory;
  confidence: number; // 0-1
  subcategories: string[]; // Tags adicionales
  reasoning?: string; // Debug/audit trail
}
```

### Clasificador Híbrido (Rule-Based + LLM)

```typescript
// classification/application/use-cases/classify-news-message.use-case.ts
@Injectable()
export class ClassifyNewsMessageUseCase {
  constructor(
    private readonly ruleBasedClassifier: RuleBasedClassifierAdapter,
    private readonly llmClassifier: LlmNewsClassifierAdapter,
    private readonly repository: ClassifiedNewsRepository,
    private readonly config: IntelligenceConfig,
  ) {}

  async execute(input: {
    channelId: string;
    messageId: number;
    content: string;
    occurredAt: Date;
  }): Promise<NewsClassificationResult> {
    // 1. Rule-based (fast, deterministic)
    const ruleResult = await this.ruleBasedClassifier.classify({
      content: input.content,
      channelId: input.channelId,
    });

    // 2. Si confidence es alta (>0.85), skip LLM (cost savings)
    if (ruleResult.confidence >= 0.85) {
      await this.persist(input, ruleResult);
      return ruleResult;
    }

    // 3. LLM refinement (solo para casos ambiguos)
    if (this.config.useLlmClassifier) {
      const llmResult = await this.llmClassifier.classify({
        content: input.content,
        ruleBasedHint: ruleResult.category,
      });

      // Blend: si LLM está muy seguro, gana; sino rule-based
      const finalResult = llmResult.confidence > 0.9 ? llmResult : ruleResult;
      await this.persist(input, finalResult);
      return finalResult;
    }

    await this.persist(input, ruleResult);
    return ruleResult;
  }

  private async persist(
    input: { channelId: string; messageId: number; occurredAt: Date },
    result: NewsClassificationResult,
  ): Promise<void> {
    const entity = ClassifiedNews.create({
      channelId: input.channelId,
      messageId: input.messageId,
      category: result.category,
      confidence: result.confidence,
      subcategories: result.subcategories,
      classifiedAt: new Date(),
      occurredAt: input.occurredAt,
    });

    await this.repository.save(entity);
  }
}
```

### Rule-Based Classifier (Regex + Keywords)

```typescript
// classification/infrastructure/adapters/rule-based-classifier.adapter.ts
@Injectable()
export class RuleBasedClassifierAdapter implements NewsClassifierPort {
  private readonly rules: Map<NewsCategory, RegExp[]> = new Map([
    [
      NewsCategory.LISTING,
      [
        /list(ing|ed)\s+(on|at)\s+\w+/i,
        /now\s+live\s+on/i,
        /available\s+on\s+(binance|coinbase|kraken)/i,
      ],
    ],
    [
      NewsCategory.AIRDROP,
      [/airdrop/i, /free\s+tokens?/i, /claim\s+your/i, /snapshot/i],
    ],
    [
      NewsCategory.HACK_EXPLOIT,
      [
        /hack(ed)?/i,
        /exploit(ed)?/i,
        /\$\d+M?\s+stolen/i,
        /security\s+breach/i,
      ],
    ],
    [
      NewsCategory.PARTNERSHIP,
      [/partner(ship)?\s+with/i, /collaborat(e|ing|ion)/i, /team(ing)?\s+up/i],
    ],
    [
      NewsCategory.FUNDING,
      [/\$\d+M?\s+raised/i, /series\s+[A-Z]/i, /funding\s+round/i, /led\s+by/i],
    ],
  ]);

  async classify(input: {
    content: string;
    channelId: string;
  }): Promise<NewsClassificationResult> {
    const matches: Array<{ category: NewsCategory; matchCount: number }> = [];

    for (const [category, patterns] of this.rules.entries()) {
      const matchCount = patterns.filter((p) => p.test(input.content)).length;
      if (matchCount > 0) {
        matches.push({ category, matchCount });
      }
    }

    if (matches.length === 0) {
      return {
        category: NewsCategory.GENERAL_NEWS,
        confidence: 0.3,
        subcategories: [],
      };
    }

    // Sort by match count, break ties by category priority
    matches.sort((a, b) => b.matchCount - a.matchCount);
    const winner = matches[0];

    return {
      category: winner.category,
      confidence: Math.min(0.95, 0.5 + winner.matchCount * 0.15),
      subcategories: matches.slice(1, 3).map((m) => m.category),
    };
  }
}
```

## 🔗 Componente 2: Clustering

### Re-uso del DeduplicationService Existente

```typescript
// clustering/application/services/deduplication-orchestrator.service.ts
@Injectable()
export class DeduplicationOrchestratorService {
  constructor(
    private readonly dedupService: DeduplicationService, // Del backend
    private readonly clusterRepo: NewsClusterRepository,
    private readonly ingestionClient: CryptoNewsIngestionClient,
  ) {}

  /**
   * Ejecuta clustering en batch (scheduler cada 5 min)
   */
  async clusterRecentMessages(windowHours = 24): Promise<NewsCluster[]> {
    // 1. Fetch mensajes recientes desde ingestion-telegram
    const messages = await this.ingestionClient.fetchRecentMessages(500);

    // 2. Filtrar por ventana temporal
    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
    const recent = messages.filter((m) => new Date(m.ingestedAt) >= cutoff);

    // 3. Agrupar por similaridad semántica
    const clusters = new Map<string, CryptoNewsMessageDto[]>();

    for (const msg of recent) {
      let foundCluster = false;

      for (const [clusterId, members] of clusters.entries()) {
        // Comparar contra el representante del cluster (primer mensaje)
        const representative = members[0];
        const similarity = await this.dedupService.computeSimilarity(
          msg.content,
          representative.content,
        );

        // Umbral: 0.7 para clustering (más permisivo que dedup 0.85)
        if (similarity >= 0.7) {
          members.push(msg);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        // Nuevo cluster
        const clusterId = `cluster-${msg.channelId}-${msg.messageId}`;
        clusters.set(clusterId, [msg]);
      }
    }

    // 4. Persistir solo clusters con 2+ miembros
    const results: NewsCluster[] = [];
    for (const [clusterId, members] of clusters.entries()) {
      if (members.length >= 2) {
        const cluster = NewsCluster.create({
          id: clusterId,
          representativeMessage: members[0], // El primero es el "canonical"
          members: members.map((m) => ({
            channelId: m.channelId,
            messageId: m.messageId,
          })),
          size: members.length,
          createdAt: new Date(),
        });

        await this.clusterRepo.save(cluster);
        results.push(cluster);
      }
    }

    return results;
  }
}
```

### Scheduler para Clustering Batch

```typescript
// clustering/infrastructure/scheduling/clustering-cron.scheduler.ts
@Injectable()
export class ClusteringCronScheduler {
  private readonly logger = new Logger(ClusteringCronScheduler.name);

  constructor(
    private readonly orchestrator: DeduplicationOrchestratorService,
    private readonly config: IntelligenceConfig,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    if (!this.config.clusteringEnabled) {
      return;
    }

    try {
      const clusters = await this.orchestrator.clusterRecentMessages(24);
      this.logger.log(
        `Clustered ${clusters.length} groups of similar messages`,
      );
    } catch (error) {
      this.logger.error('Clustering failed', error);
    }
  }
}
```

## 📈 Componente 3: Re-Ranking

### Fórmula de Scoring Multi-Dimensional

```typescript
// ranking/application/services/scoring-formula.service.ts
@Injectable()
export class ScoringFormulaService {
  /**
   * Calcula score de relevancia (0-100)
   *
   * Dimensiones:
   * - Novedad temporal (30%)
   * - Engagement potencial (25%)
   * - Calidad del source (20%)
   * - Clasificación categórica (15%)
   * - Singularidad (no-cluster) (10%)
   */
  computeRelevanceScore(input: {
    message: CryptoNewsMessageDto;
    classification: NewsClassificationResult;
    clusterSize: number; // 1 si no está en cluster
    sourceReputation: number; // 0-1
    hoursSincePublished: number;
  }): number {
    // 1. Novedad temporal (decay exponencial)
    const ageScore = Math.exp(-input.hoursSincePublished / 12) * 30;

    // 2. Engagement potencial (media + keywords detectados)
    const hasMedia = input.message.media.length > 0;
    const contentLength = input.message.content.length;
    const engagementScore =
      (hasMedia ? 15 : 0) +
      (contentLength > 200 && contentLength < 1000 ? 10 : 0); // Sweet spot

    // 3. Calidad del source
    const sourceScore = input.sourceReputation * 20;

    // 4. Boost por categoría de alto valor
    const highValueCategories = new Set([
      NewsCategory.LISTING,
      NewsCategory.HACK_EXPLOIT,
      NewsCategory.FUNDING,
      NewsCategory.PARTNERSHIP,
    ]);
    const categoryBoost = highValueCategories.has(input.classification.category)
      ? 15 * input.classification.confidence
      : 5;

    // 5. Penalty por duplicación (preferir cluster representatives)
    const uniquenessScore =
      input.clusterSize === 1
        ? 10
        : Math.max(0, 10 - (input.clusterSize - 1) * 2); // -2 por cada duplicado

    const total =
      ageScore +
      engagementScore +
      sourceScore +
      categoryBoost +
      uniquenessScore;
    return Math.min(100, Math.max(0, total));
  }
}
```

### Use Case de Re-Ranking

```typescript
// ranking/application/use-cases/rank-news-feed.use-case.ts
@Injectable()
export class RankNewsFeedUseCase {
  constructor(
    private readonly ingestionClient: CryptoNewsIngestionClient,
    private readonly classificationRepo: ClassifiedNewsRepository,
    private readonly clusterRepo: NewsClusterRepository,
    private readonly scoringFormula: ScoringFormulaService,
    private readonly sourceRepo: CryptoNewsSourceRepository, // Read-only
  ) {}

  async execute(query: {
    limit?: number;
    category?: NewsCategory;
    minScore?: number;
  }): Promise<RankedNewsItem[]> {
    // 1. Fetch mensajes RAW desde ingestion-telegram
    const messages = await this.ingestionClient.fetchRecentMessages(
      query.limit || 100,
    );

    // 2. Cargar clasificaciones + clusters en parallel
    const [classifications, clusters] = await Promise.all([
      this.classificationRepo.findByMessageIds(
        messages.map((m) => ({
          channelId: m.channelId,
          messageId: m.messageId,
        })),
      ),
      this.clusterRepo.findByWindow(24), // Últimas 24h
    ]);

    // 3. Build lookup maps
    const classMap = new Map(
      classifications.map((c) => [`${c.channelId}:${c.messageId}`, c]),
    );
    const clusterMap = this.buildClusterLookup(clusters);

    // 4. Score cada mensaje
    const scored: Array<{ message: CryptoNewsMessageDto; score: number }> = [];

    for (const msg of messages) {
      const key = `${msg.channelId}:${msg.messageId}`;
      const classification = classMap.get(key);

      // Skip si no hay clasificación o no match query category
      if (!classification) continue;
      if (query.category && classification.category !== query.category)
        continue;

      const clusterSize = clusterMap.get(key) || 1;
      const sourceReputation = await this.getSourceReputation(msg.channelId);
      const hoursSince =
        (Date.now() - new Date(msg.publishedAt).getTime()) / 3600000;

      const score = this.scoringFormula.computeRelevanceScore({
        message: msg,
        classification,
        clusterSize,
        sourceReputation,
        hoursSincePublished: hoursSince,
      });

      if (score >= (query.minScore || 0)) {
        scored.push({ message: msg, score });
      }
    }

    // 5. Sort by score DESC
    scored.sort((a, b) => b.score - a.score);

    // 6. Transform to ranked items
    return scored.slice(0, query.limit || 50).map((item, index) => ({
      ...item.message,
      rank: index + 1,
      relevanceScore: item.score,
      classification: classMap.get(
        `${item.message.channelId}:${item.message.messageId}`,
      )!,
    }));
  }

  private buildClusterLookup(clusters: NewsCluster[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const cluster of clusters) {
      for (const member of cluster.members) {
        map.set(`${member.channelId}:${member.messageId}`, cluster.size);
      }
    }
    return map;
  }

  private async getSourceReputation(channelId: string): Promise<number> {
    // Placeholder: en el futuro integrar con KOL reputation
    return 0.7;
  }
}
```

## 🔌 API Endpoints

```typescript
// api/controllers/intelligence.controller.ts
@Controller('crypto-news-intelligence')
export class IntelligenceController {
  constructor(
    private readonly rankFeedUseCase: RankNewsFeedUseCase,
    private readonly classifyUseCase: ClassifyNewsMessageUseCase,
  ) {}

  @Get('feed/ranked')
  async getRankedFeed(
    @Query() query: IntelligenceFeedQueryDto,
  ): Promise<RankedNewsItem[]> {
    return this.rankFeedUseCase.execute({
      limit: query.limit,
      category: query.category,
      minScore: query.minScore,
    });
  }

  @Get('categories/stats')
  async getCategoryStats(): Promise<CategoryStatsDto[]> {
    // Agregación de clasificaciones por categoría (últimas 24h)
    // Para dashboard analytics
  }

  @Post('classify/:channelId/:messageId')
  async manualClassify(
    @Param('channelId') channelId: string,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() body: { overrideCategory?: NewsCategory },
  ): Promise<NewsClassificationResult> {
    // Manual override para training data
  }
}
```

## 🗄️ Esquema de Base de Datos

```sql
-- classification/infrastructure/persistence/entities
CREATE TABLE classified_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(64) NOT NULL,
  message_id INTEGER NOT NULL,
  category VARCHAR(32) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  subcategories TEXT[], -- Array de tags
  reasoning TEXT, -- Audit trail del LLM
  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE(channel_id, message_id)
);

CREATE INDEX idx_classified_news_category ON classified_news(category);
CREATE INDEX idx_classified_news_occurred ON classified_news(occurred_at DESC);

-- clustering/infrastructure/persistence/entities
CREATE TABLE news_clusters (
  id VARCHAR(128) PRIMARY KEY,
  representative_channel_id VARCHAR(64) NOT NULL,
  representative_message_id INTEGER NOT NULL,
  member_count INTEGER NOT NULL,
  members JSONB NOT NULL, -- [{channelId, messageId}, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_clusters_created ON news_clusters(created_at DESC);
CREATE INDEX idx_news_clusters_representative ON news_clusters(representative_channel_id, representative_message_id);

-- ranking (ephemeral, cache-only — no persistence needed)
```

## ⚙️ Configuración

```typescript
// core/config/intelligence.config.ts
@Injectable()
export class IntelligenceConfig {
  @IsBoolean()
  @Default(true)
  classificationEnabled: boolean;

  @IsBoolean()
  @Default(false) // Caro, activar solo cuando rule-based no alcance
  useLlmClassifier: boolean;

  @IsBoolean()
  @Default(true)
  clusteringEnabled: boolean;

  @IsNumber()
  @Min(0.5)
  @Max(0.95)
  @Default(0.7)
  clusteringSimilarityThreshold: number;

  @IsNumber()
  @Min(1)
  @Max(72)
  @Default(24)
  clusteringWindowHours: number;

  @IsBoolean()
  @Default(true)
  rankingEnabled: boolean;
}
```

```bash
# .env
INTELLIGENCE_CLASSIFICATION_ENABLED=true
INTELLIGENCE_USE_LLM_CLASSIFIER=false
INTELLIGENCE_CLUSTERING_ENABLED=true
INTELLIGENCE_CLUSTERING_THRESHOLD=0.7
INTELLIGENCE_RANKING_ENABLED=true
```

## 🎯 Plan de Implementación Faseado

### **Fase 1: Clasificación Rule-Based** (1 semana)

- ✅ Crear módulo `crypto-news-intelligence`
- ✅ Implementar `RuleBasedClassifierAdapter` con 10 categorías principales
- ✅ Integrar en `MessageRoutingService` (async, no-blocking)
- ✅ Migrations + entidades de persistencia
- ✅ Tests unitarios + e2e

### **Fase 2: Clustering** (3 días)

- ✅ Re-usar `DeduplicationService` existente
- ✅ Crear `DeduplicationOrchestratorService`
- ✅ Scheduler cada 5 minutos
- ✅ API endpoint `GET /clusters/recent`

### **Fase 3: Re-Ranking** (4 días)

- ✅ Implementar `ScoringFormulaService` con 5 dimensiones
- ✅ `RankNewsFeedUseCase` con query filtering
- ✅ API endpoint `GET /feed/ranked?category=&minScore=`
- ✅ Frontend integration (replace simple list with ranked feed)

### **Fase 4: LLM Refinement** (opcional, post-MVP)

- ⚠️ Solo activar si rule-based no alcanza 80%+ accuracy
- ✅ `LlmNewsClassifierAdapter` con prompt engineering
- ✅ Fallback chain: rule-based → LLM si confidence < 0.85
- ✅ Cost tracking + budget alerts

## 📊 Métricas de Éxito

```typescript
// Tracking interno para evaluar performance
interface IntelligenceMetrics {
  classificationAccuracy: number; // % correctamente clasificados (manual validation)
  clusteringPrecision: number; // % de clusters sin false positives
  rankingNDCG: number; // Normalized Discounted Cumulative Gain
  avgProcessingTimeMs: number;
  llmApiCostPerDay: number; // Solo si se activa LLM
}
```

## 🚀 Ventajas de esta Arquitectura

1. **Incremental**: Cada componente se puede desplegar independientemente
2. **Re-usa infraestructura**: `DeduplicationService`, `LlmModule`, `FilteredCryptoNewsService`
3. **Fail-open**: Errores en intelligence NO bloquean pipeline principal
4. **Cost-aware**: Rule-based first, LLM solo cuando necesario
5. **DDD-compliant**: Sigue patrones existentes del proyecto (aggregates, ports, use-cases)
6. **Escalable**: Clustering en batch, clasificación async, ranking on-read

## 🔄 Integración con el Sistema Actual

### Puntos de Integración Clave

1. **MessageRoutingService** (apps/backend/src/telegram/ingestion/shared/application/)
   - Agregar rama para `routeToCryptoNewsIntelligence` después de `ProcessCryptoNewsMessageHandler`
   - Clasificación async, no-blocking

2. **CryptoNewsIngestionClient** (apps/backend/src/telegram/crypto-news-integration/)
   - Ya existe y maneja HTTP calls a ingestion-telegram
   - Re-usar para fetch de mensajes en clustering/ranking

3. **DeduplicationService** (apps/backend/src/shared/deduplication/)
   - Ya implementa semantic similarity con embeddings
   - Re-usar para clustering (threshold más permisivo: 0.7 vs 0.85)

4. **FilteredCryptoNewsService** (apps/backend/src/telegram/crypto-news-integration/)
   - Usar clasificación para enhanced filtering
   - `category` como dimensión adicional en matching

5. **Frontend** (apps/frontend/)
   - Nuevo endpoint `GET /crypto-news-intelligence/feed/ranked`
   - UI filters por categoría
   - Badges visuales por clasificación

## 🎨 Flujo de Datos Completo

```
Telegram → Ingestion-telegram (RAW storage)
              ↓ SSE stream
Backend MessageRoutingService
              ↓
┌─────────────┴─────────────┐
│                           │
ProcessCryptoNewsHandler    ClassifyNewsMessageUseCase (async)
(matching + enqueue)        (rule-based → DB)
│                           │
└─────────────┬─────────────┘
              ↓
Frontend queries:
  - GET /feed/ranked?category=listing&minScore=70
    → RankNewsFeedUseCase
    → Fetch RAW + join classifications + join clusters
    → Score + sort
    → Return ranked feed
```

## 📝 Notas de Implementación

### Performance Considerations

1. **Clasificación**: <100ms per message (rule-based), <2s con LLM
2. **Clustering**: Batch process, ~30s para 500 messages
3. **Ranking**: On-read query, <500ms para 100 messages

### Error Handling

- Classification failure → default to `GENERAL_NEWS` (confidence 0.3)
- Clustering failure → skip batch, log error, retry next cycle
- Ranking failure → fallback to chronological sort

### Monitoring

- Prometheus metrics para cada componente
- Alert on classification queue backlog > 1000
- Alert on clustering duration > 60s

## 🔐 Security & Privacy

- No PII storage en clasificación (solo channelId + messageId refs)
- LLM prompts NEVER include user data
- Rate limiting en manual classification endpoint
- Audit log para manual overrides

## 🧪 Testing Strategy

### Unit Tests

- Rule-based classifier: 100+ test cases por categoría
- Scoring formula: property-based testing (score bounds, monotonicity)
- Clustering: synthetic duplicate detection

### Integration Tests

- End-to-end classification pipeline
- Deduplication service integration
- Database persistence layer

### E2E Tests

- HTTP API endpoints
- Frontend integration
- Performance benchmarks

---

**Next Steps**: Review with team → Approve architecture → Create implementation tasks → Fase 1 kickoff

---

## 📊 Análisis de Datos Reales (Producción)

### Estado Actual de la DB de Ingestion-Telegram

**Servidor**: OracleDroplet (`onchain-bot-postgres-production`)  
**Database**: `alpha_meta_token_scanner_ingestion`  
**User**: `alpha_meta_token_scanner`

**Tablas**:

- `telegram_feed_messages` — Mensajes RAW (291 mensajes totales, 72h retention)
- `telegram_feed_message_media` — Media metadata
- `telegram_feed_sources` — Fuentes activas (10 canales crypto-news)
- `channel_content_filter_configs` — Filtros por canal
- `backfill_messages` — Backfill tracking

**Volumen (últimas 24h)**:

- **Total mensajes**: ~65 mensajes/día
- **Top 5 canales por volumen**:
  1. Watcher Guru (@WatcherGuru) — 19 mensajes
  2. Cointelegraph (@cointelegraph) — 17 mensajes
  3. Shoal Research Hub (@shoalresearch) — 15 mensajes
  4. Lookonchain (@lookonchainchannel) — 11 mensajes
  5. unfolded. DeFi (@unfolded_defi) — 3 mensajes

**Ventana temporal**: Datos desde 2026-09-22 (72h retention activo)

### Ejemplos de Contenido Real

**Mensaje 1 (Watcher Guru)**:

```
US SEIZES $84M FROM MONTANA PAYMENTS FIRM CAPSTONE, ALLEGEDLY MOVING
HUNDREDS OF MILLIONS FOR TETHER AND BITFINEX VIA CARIBBEAN BANK EQIBANK: FT
```

- Longitud: 144 chars
- Media: 0
- Categoría potencial: `REGULATION` / `LEGAL`

**Mensaje 2 (Watcher Guru)**:

```
JUST IN: 🇺🇸🇨🇳 President Trump says Chinese President Xi Jinping agrees
Artificial Intelligence should be renamed "Super Intelligence."
@WatcherGuru
```

- Longitud: 148 chars
- Media: 0
- Categoría potencial: `REGULATION` / `GENERAL_NEWS`

**Mensaje 3 (Lookonchain)**:

```
Bonk Guy (@theunipcs) remains firmly at #1 on the FOMO leaderboard, with his
portfolio up over $1M in the past 24 hours.

He continues to hold $PONS, $USELESS, and $MarsCoin without taking any profits.

https://fomo.family/profile/unipcs
```

- Longitud: ~280 chars
- Media: 1 foto
- Categoría potencial: `WHALE_ACTIVITY` / `PRICE_MOVEMENT`

**Mensaje 4 (Watcher Guru)**:

```
JUST IN: 🇺🇸 $2.8 trillion Citi says investors should buy the next US stock
market pullback.
@WatcherGuru
```

- Longitud: ~110 chars
- Media: 0
- Categoría potencial: `GENERAL_NEWS` / `FUNDING`

### Patrones Detectados

1. **Breaking News Format** (40%):
   - Prefijos: `JUST IN:`, `BREAKING:`, `🚨`
   - Emojis de banderas: 🇺🇸, 🇨🇳
   - Referencias a entidades: Trump, Xi Jinping, Citi
   - Longitud promedio: 100-150 chars

2. **On-Chain Activity** (25%):
   - Whale tracking (@unipcs, portfolio movements)
   - Token mentions: $PONS, $USELESS, $MarsCoin
   - Portfolio values: "$1M in 24 hours"
   - Enlaces externos: fomo.family

3. **Regulatory/Legal** (20%):
   - Keywords: SEIZES, ALLEGEDLY, HUNDREDS OF MILLIONS
   - Instituciones: Montana firm, Tether, Bitfinex
   - Fuentes: Financial Times (FT)

4. **Market Analysis** (15%):
   - Instituciones financieras: Citi ($2.8T)
   - Recomendaciones: "buy the pullback"
   - Menciones de handle: @WatcherGuru

### Distribución de Media

- **70% sin media** (solo texto)
- **30% con media** (1 imagen típicamente)
- Videos: <5%
