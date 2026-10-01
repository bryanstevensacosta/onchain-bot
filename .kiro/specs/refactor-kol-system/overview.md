# Refactor KOL System - Guía de Arquitectura (Template-Based Publishing)

> **Versión**: 2.0 (Robust Design)  
> **Fecha**: 2026-09-24  
> **Propósito**: Sistema KOL completo con template-based multi-channel publishing  
> **Continuación de**: [refactor-content-publisher](../refactor-content-publisher/11-refactor.md)

---

## 🎯 Visión General

Sistema KOL independiente con **template-based publishing**: múltiples canales configurables, diferentes bots Telegram, rankings personalizados, y UI de curation.

### Arquitectura Core: Template System

En lugar de un pipeline rígido "VIP calls → 1 bot", el sistema soporta:

```
📋 Template 1: "VIP Calls Alpha"
├─ Sources: KOL tier-1 (high reputation > 0.85)
├─ Pipeline: Full (extraction → scoring)
├─ Ranking: Top 5 by score
├─ Approval: Manual (UI curation)
└─ Bot: @VIPCallsAlphaBot

📋 Template 2: "Community Signals"
├─ Sources: KOL tier-2 + tier-3
├─ Pipeline: Basic (scoring only, no classification)
├─ Ranking: Top 10 by engagement
├─ Approval: Auto (score > 70)
└─ Bot: @CommunitySignalsBot

📋 Template N: [User-defined via UI]
```

### Objetivos del Refactor

1. **Desacoplamiento total** — Mover toda la lógica KOL fuera del backend
2. **Template-based publishing** — N canales configurables con diferentes bots/reglas
3. **Pipeline completo event-driven** — Extraction → Approval → Publishing
4. **Multi-bot architecture** — Soporte para múltiples bots Telegram simultáneos
5. **UI-driven curation** — Frontend dashboard para review, ranking, y manual publish
6. **Escalabilidad horizontal** — Deploy independiente + multi-template concurrency
7. **A/B testing ready** — Comparar diferentes scoring strategies side-by-side

---

## 📊 Estado Actual vs Propuesto

### Estado Actual (Distribuido en Backend)

```
apps/backend/src/
├── kol/                              # BC KOL (4 subdominios)
│   ├── identity/                     # KOL profiles + channels
│   ├── reputation/                   # Reputation scoring
│   ├── source/                       # KOL source management
│   └── stats/                        # KOL statistics
│
├── telegram/
│   ├── ingestion/
│   │   └── kol/                      # KOL message ingestion (legacy location)
│   │       ├── extraction/           # Extract candidates from raw text
│   │       ├── parsing/              # Parse structured calls
│   │       └── shared/
│   │
│   ├── vip-calls/                    # VIP call publishing
│   │   ├── normalization/            # Normalize parsed calls
│   │   ├── vip-channel/              # Publisher (reserve → publish → finalize)
│   │   └── approval/                 # Approval logic
│   │
│   └── shared/                       # Bot API adapter (COMPARTIDO con crypto-news)
│
├── token/                            # Token enrichment (USADO por KOL pipeline)
├── chain/                            # Chain detection (USADO por KOL pipeline)
└── shared/                           # Cross-cutting concerns

apps/ingestion-telegram/              # MTProto session per-env
├── telegram/kol/                     # RAW KOL message ingestion
└── (streams to backend via SSE)
```

**Problemas**:

- ❌ KOL lógica distribuida en 3+ ubicaciones (`kol/`, `telegram/ingestion/kol/`, `telegram/vip-calls/`)
- ❌ Pipeline incompleto en backend (extraction + parsing acoplados, no event-driven)
- ❌ Bot API adapter compartido con crypto-news (coupling)
- ❌ Token/chain enrichment acoplado al backend (dependencias circulares)
- ❌ `ingestion-telegram` streaming KOL data al backend (tight coupling)
- ❌ No clear separation entre ingestion cruda y procesamiento

---

### Estado Propuesto (App Dedicada + Template System)

```
apps/kol-system/
├── ingestion/                        # Conexión con ingestion-telegram (HTTP + SSE)
├── extraction/                       # BC: Extracción de candidatos
├── parsing/                          # BC: Parsing de candidatos
├── normalization/                    # BC: Normalización de calls
├── enrichment/                       # BC: Token/chain enrichment
├── classification/                   # BC: Token classification
├── scoring/                          # BC: Call scoring
│
├── templates/                        # 🆕 BC: Template configuration
│   ├── domain/
│   │   └── aggregates/
│   │       └── publishing-template.aggregate.ts
│   ├── application/
│   │   ├── use-cases/
│   │   │   ├── create-template.use-case.ts
│   │   │   ├── update-template-config.use-case.ts
│   │   │   └── get-template-rankings.use-case.ts
│   │   └── services/
│   │       ├── template-orchestrator.service.ts
│   │       └── ranking-engine.service.ts
│   └── api/
│       └── controllers/
│           └── templates.controller.ts
│
├── approval/                         # BC: Approval workflow (template-aware)
│   ├── domain/
│   │   └── aggregates/
│   │       └── call-approval.aggregate.ts
│   ├── application/
│   │   └── use-cases/
│   │       ├── evaluate-approval.use-case.ts
│   │       └── get-pending-approvals.use-case.ts  # For UI
│   └── api/
│       └── controllers/
│           └── approvals.controller.ts
│
├── publishing/                       # BC: Multi-bot publishing
│   ├── domain/
│   │   └── aggregates/
│   │       └── publishing-job.aggregate.ts        # Template-based
│   ├── application/
│   │   └── use-cases/
│   │       ├── publish-from-template.use-case.ts
│   │       └── manual-publish.use-case.ts         # UI trigger
│   └── infrastructure/
│       └── telegram/
│           └── multi-bot-publisher.adapter.ts     # N bots simultaneously
│
├── tracking/                         # BC: Call tracking + evaluations
├── kol-identity/                     # BC: KOL profiles (migrado desde backend)
├── telegram/                         # Multi-bot adapters (shared infra)
├── shared/                           # Cross-cutting (domain, infra, utils)
├── main.ts                           # Bootstrap (puerto :3050 dev)
└── app.module.ts                     # Root module (imports 14 BCs)
```

**Beneficios Template System**:

- ✅ **Multi-channel publishing** — N templates = N bots/channels independientes
- ✅ **Configuración dinámica** — Cambiar scoring/ranking sin redeploy
- ✅ **A/B testing** — Comparar diferentes strategies side-by-side
- ✅ **UI-driven** — Frontend dashboard para review + manual publish
- ✅ **SaaS-ready** — 1 template = 1 customer (multi-tenant)
- ✅ **Escalabilidad** — Cada template procesa su propio pipeline independientemente

---

## 🔄 Conexión con `ingestion-telegram`

### Método Recomendado: **HTTP API + SSE** (mismo patrón que content-publisher)

**Rationale**:

- ✅ **Consistencia** — Mismo patrón que `content-publisher` ← `ingestion-telegram`
- ✅ **Desacoplamiento** — `kol-system` no depende de MTProto, solo HTTP
- ✅ **Escalabilidad** — `ingestion-telegram` puede servir N consumers (backend legacy + content-publisher + kol-system)
- ✅ **Observability** — HTTP logs + SSE connection status fáciles de monitorear

### Arquitectura de Conexión

```
┌─────────────────────────────────────────────┐
│  ingestion-telegram (:3031 dev, :3033       │
│  staging, :3032 prod)                       │
│                                             │
│  ENDPOINTS (read-only para kol-system):     │
│  → GET /api/feed/kols (active KOLs list)   │
│  → GET /api/feed/kol-messages?limit=50     │
│  → GET /api/ingestion/stream (SSE, KOL     │
│     events incluidos)                       │
└────────────────┬────────────────────────────┘
                 │ HTTP API (read-only)
                 │ SSE (metadata-only events)
                 │
┌────────────────▼────────────────────────────┐
│  kol-system (:3050 dev, :3051 staging,      │
│  :3052 prod)                                │
│                                             │
│  INGESTION MODULE:                          │
│  1. KolIngestionClient → GET kol-messages   │
│     (polling fallback 1 min)                │
│  2. SSE listener → subscribe /stream        │
│     (realtime metadata: new KOL message     │
│     arrived)                                │
│  3. ProcessKolMessageHandler →              │
│     extraction BC (event bus)               │
│                                             │
│  PIPELINE (event-driven):                   │
│  ingestion → extraction → parsing →         │
│  normalization → enrichment →               │
│  classification → scoring → approval →      │
│  publishing → tracking                      │
└─────────────────────────────────────────────┘
```

### Implementación: `ingestion/` Module

```typescript
// ingestion/infrastructure/http/ingestion-http-client.adapter.ts
@Injectable()
export class IngestionHttpClientAdapter implements IngestionClientPort {
  constructor(
    private readonly httpClient: HttpClientService,
    private readonly config: ConfigService,
  ) {}

  async getRecentKolMessages(params: {
    limit: number;
    kolId?: string;
  }): Promise<RawKolMessage[]> {
    const url = `${this.config.get('INGESTION_TELEGRAM_URL')}/api/feed/kol-messages`;
    const response = await this.httpClient.get<RawKolMessage[]>(url, {
      params: { limit: params.limit, kolId: params.kolId },
    });
    return response.data;
  }

  async getActiveKols(): Promise<KolSource[]> {
    const url = `${this.config.get('INGESTION_TELEGRAM_URL')}/api/feed/kols`;
    const response = await this.httpClient.get<KolSource[]>(url);
    return response.data;
  }
}

// ingestion/application/handlers/process-kol-message.handler.ts
@Injectable()
export class ProcessKolMessageHandler {
  constructor(
    private readonly ingestionClient: IngestionHttpClientAdapter,
    private readonly eventBus: EventBus,
  ) {}

  @OnEvent('ingestion.sse.kol-message-arrived')
  async handle(event: { channelId: string; messageId: string }) {
    // 1. Fetch full message from ingestion-telegram
    const messages = await this.ingestionClient.getRecentKolMessages({
      limit: 1,
      kolId: event.channelId,
    });
    const message = messages.find((m) => m.id === event.messageId);
    if (!message) return;

    // 2. Emit to extraction BC
    await this.eventBus.publish(
      new KolMessageIngestedEvent({
        kolId: message.kolId,
        channelId: message.channelId,
        messageId: message.messageId,
        rawText: message.text,
        ingestedAt: message.ingestedAt,
      }),
    );
  }
}
```

**SSE Listener** (reutilizar patrón de `content-publisher`):

```typescript
// ingestion/infrastructure/sse/ingestion-sse-listener.adapter.ts
@Injectable()
export class IngestionSseListenerAdapter {
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30_000; // 30s

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {}

  async start() {
    const url = `${this.config.get('INGESTION_TELEGRAM_URL')}/api/ingestion/stream`;

    while (true) {
      try {
        await this.connect(url);
        this.reconnectAttempts = 0; // Reset on successful connection
      } catch (error) {
        this.logger.error('SSE connection failed', error);
        await this.backoff();
      }
    }
  }

  private async connect(url: string) {
    const response = await fetch(url);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5));

          // Filter only KOL events
          if (data.type === 'kol-message-arrived') {
            await this.eventBus.publish(
              new IngestionSseKolMessageArrivedEvent(data.payload),
            );
          }
        }
      }
    }
  }

  private async backoff() {
    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    );
    this.logger.log(`Reconnecting in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.reconnectAttempts++;
  }
}
```

---

## 🎨 Template System Architecture (CORE)

### Template Domain Model

```typescript
// templates/domain/aggregates/publishing-template.aggregate.ts

export class PublishingTemplate extends AggregateRoot<TemplateId> {
  private name: string;
  private description: string;
  private active: boolean;
  private createdBy: UserId;
  private createdAt: Date;
  private updatedAt: Date;

  // 1. SOURCE CONFIGURATION
  private sourceConfig: SourceConfig;
  // {
  //   type: 'kol-filter',  // 'kol-filter' | 'channel-list' | 'reputation-threshold'
  //   filters: {
  //     kolIds: ['kol-1', 'kol-2'],        // Specific KOLs (optional)
  //     minReputation: 0.85,               // Min reputation score (optional)
  //     tiers: ['tier-1', 'tier-2'],       // KOL tiers (optional)
  //     excludeKolIds: ['kol-spam']        // Blacklist (optional)
  //   }
  // }

  // 2. PIPELINE CONFIGURATION
  private pipelineConfig: PipelineConfig;
  // {
  //   enabledSteps: ['extraction', 'parsing', 'normalization', 'enrichment', 'scoring'],
  //   scoringRules: {
  //     baseScore: 50,
  //     tierWeights: { high: 80, medium: 60, low: 40 },
  //     reputationMultiplier: { min: 0.85, max: 1.15 },
  //     minScore: 60  // Fail-fast threshold
  //   },
  //   enrichmentConfig: {
  //     providers: ['helius', 'dexscreener', 'birdeye'],  // Cascade order
  //     timeout: 5000,  // ms per provider
  //     failureStrategy: 'degraded'  // 'degraded' | 'hard-fail'
  //   },
  //   classificationEnabled: false  // Optional ML classification
  // }

  // 3. RANKING CONFIGURATION
  private rankingConfig: RankingConfig;
  // {
  //   strategy: 'score-desc',  // 'score-desc' | 'engagement' | 'recency' | 'weighted'
  //   limit: 5,                // Top N calls
  //   filters: {
  //     minScore: 70,          // Additional filter after scoring
  //     maxAge: 3600           // Max age in seconds (1h)
  //   },
  //   weights: {               // For 'weighted' strategy
  //     score: 0.7,
  //     engagement: 0.2,
  //     recency: 0.1
  //   }
  // }

  // 4. APPROVAL CONFIGURATION
  private approvalConfig: ApprovalConfig;
  // {
  //   mode: 'manual',  // 'manual' | 'auto' | 'hybrid'
  //   autoApprovalRules: {
  //     enabled: false,
  //     minScore: 80,           // Auto-approve if score >= 80
  //     maxPerDay: 10,          // Safety cap
  //     requiresMinimumAge: 300 // Wait 5 min before auto-approve
  //   },
  //   reviewers: ['user-1', 'user-2']  // Who can approve (for UI)
  // }

  // 5. PUBLISHING CONFIGURATION
  private publishingConfig: PublishingConfig;
  // {
  //   botToken: 'TEMPLATE_1_BOT_TOKEN',  // Unique per template
  //   chatId: '-100123456',              // Target Telegram channel
  //   messageFormat: 'rich',             // 'rich' | 'simple' | 'custom'
  //   customTemplate: '...',             // Jinja2-like template (optional)
  //   rateLimits: {
  //     maxPerHour: 5,
  //     maxPerDay: 20,
  //     minIntervalSeconds: 300  // 5 min between publishes
  //   },
  //   retryConfig: {
  //     maxAttempts: 3,
  //     backoffMs: 2000
  //   }
  // }

  // 6. MONITORING CONFIGURATION
  private monitoringConfig: MonitoringConfig;
  // {
  //   metricsEnabled: true,
  //   alerting: {
  //     lowPublishRate: { threshold: 5, window: '24h' },  // < 5 calls/day
  //     highRejectRate: { threshold: 0.8, window: '24h' } // > 80% rejected
  //   },
  //   webhooks: ['https://hooks.slack.com/...']  // Alert destinations
  // }

  // DOMAIN METHODS

  public createPublishingJob(scoredCall: ScoredCall): PublishingJob {
    if (!this.active) {
      throw new TemplateInactiveException(this.id);
    }

    if (!this.passesRankingFilters(scoredCall)) {
      throw new CallDoesNotMeetCriteriaException(scoredCall.id, this.id);
    }

    return PublishingJob.create({
      templateId: this.id,
      callId: scoredCall.id,
      publishingConfig: this.publishingConfig,
      requiresApproval: this.requiresApproval(scoredCall),
      estimatedPublishTime: this.calculatePublishTime(),
    });
  }

  public rankCalls(calls: ScoredCall[]): RankedCall[] {
    // Filter by source config
    const filteredCalls = calls.filter((call) =>
      this.sourceConfig.matchesCall(call),
    );

    // Apply ranking strategy
    const rankedCalls = this.rankingConfig.rank(filteredCalls);

    // Apply limit
    return rankedCalls.slice(0, this.rankingConfig.limit);
  }

  public requiresApproval(call: ScoredCall): boolean {
    if (this.approvalConfig.mode === 'manual') return true;
    if (this.approvalConfig.mode === 'auto') return false;

    // Hybrid: auto-approve if meets criteria
    const rules = this.approvalConfig.autoApprovalRules;
    if (!rules.enabled) return true;

    return call.score < rules.minScore || call.age < rules.requiresMinimumAge;
  }

  public canPublish(): boolean {
    if (!this.active) return false;

    // Check rate limits (require querying published_calls table)
    // This would be a domain service call in practice
    return true;
  }

  public activate(): void {
    if (this.active) {
      throw new TemplateAlreadyActiveException(this.id);
    }

    this.active = true;
    this.addDomainEvent(new TemplateActivatedEvent(this.id));
  }

  public deactivate(): void {
    if (!this.active) {
      throw new TemplateAlreadyInactiveException(this.id);
    }

    this.active = false;
    this.addDomainEvent(new TemplateDeactivatedEvent(this.id));
  }

  public updateSourceConfig(newConfig: SourceConfig): void {
    this.sourceConfig = newConfig;
    this.updatedAt = new Date();
    this.addDomainEvent(
      new TemplateSourceConfigUpdatedEvent(this.id, newConfig),
    );
  }

  public updateScoringRules(newRules: ScoringRules): void {
    this.pipelineConfig.scoringRules = newRules;
    this.updatedAt = new Date();
    this.addDomainEvent(
      new TemplateScoringRulesUpdatedEvent(this.id, newRules),
    );
  }

  public updateRankingConfig(newConfig: RankingConfig): void {
    this.rankingConfig = newConfig;
    this.updatedAt = new Date();
    this.addDomainEvent(
      new TemplateRankingConfigUpdatedEvent(this.id, newConfig),
    );
  }

  // Factory
  public static create(params: CreateTemplateParams): PublishingTemplate {
    const template = new PublishingTemplate(TemplateId.generate());
    template.name = params.name;
    template.description = params.description;
    template.active = false; // Start inactive
    template.sourceConfig = params.sourceConfig;
    template.pipelineConfig = params.pipelineConfig;
    template.rankingConfig = params.rankingConfig;
    template.approvalConfig = params.approvalConfig;
    template.publishingConfig = params.publishingConfig;
    template.monitoringConfig = params.monitoringConfig;
    template.createdBy = params.createdBy;
    template.createdAt = new Date();
    template.updatedAt = new Date();

    template.addDomainEvent(new TemplateCreatedEvent(template.id, params));
    return template;
  }
}
```

---

### Template Orchestrator Service

```typescript
// templates/application/services/template-orchestrator.service.ts

@Injectable()
export class TemplateOrchestratorService {
  constructor(
    private readonly templateRepo: TemplateRepository,
    private readonly scoredCallRepo: ScoredCallRepository,
    private readonly publishingJobRepo: PublishingJobRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {}

  /**
   * Main orchestration: Process scored calls across all active templates
   * Runs every 1 minute (cron scheduler)
   */
  async processAllTemplates(): Promise<void> {
    const activeTemplates = await this.templateRepo.findActive();

    if (activeTemplates.length === 0) {
      this.logger.warn('No active templates found');
      return;
    }

    this.logger.log(`Processing ${activeTemplates.length} active templates`);

    // Process templates in parallel
    await Promise.all(
      activeTemplates.map((template) => this.processTemplate(template)),
    );
  }

  /**
   * Process single template: fetch calls → rank → create jobs
   */
  private async processTemplate(template: PublishingTemplate): Promise<void> {
    try {
      // 1. Fetch recent scored calls (last 24h)
      const calls = await this.scoredCallRepo.findRecent({
        limit: 100,
        maxAge: 86400, // 24h in seconds
      });

      if (calls.length === 0) {
        this.logger.debug(`Template ${template.name}: No calls to process`);
        return;
      }

      // 2. Rank calls according to template config
      const rankedCalls = template.rankCalls(calls);

      if (rankedCalls.length === 0) {
        this.logger.debug(
          `Template ${template.name}: No calls passed ranking filters`,
        );
        return;
      }

      this.logger.log(
        `Template ${template.name}: Ranked ${rankedCalls.length} calls`,
      );

      // 3. Create publishing jobs for ranked calls
      for (const [index, rankedCall] of rankedCalls.entries()) {
        await this.createPublishingJob(template, rankedCall, index + 1);
      }
    } catch (error) {
      this.logger.error(`Template ${template.name}: Processing failed`, error);

      await this.eventBus.publish(
        new TemplateProcessingFailedEvent(template.id, error.message),
      );
    }
  }

  /**
   * Create publishing job (idempotent: check if already exists)
   */
  private async createPublishingJob(
    template: PublishingTemplate,
    rankedCall: RankedCall,
    rank: number,
  ): Promise<void> {
    // Check if job already exists for this call + template
    const existing = await this.publishingJobRepo.findOne({
      templateId: template.id,
      callId: rankedCall.call.id,
    });

    if (existing) {
      this.logger.debug(
        `Publishing job already exists: ${existing.id} ` +
          `(template: ${template.name}, call: ${rankedCall.call.ticker})`,
      );
      return;
    }

    // Create new job
    const job = template.createPublishingJob(rankedCall.call);
    job.setRank(rank);

    await this.publishingJobRepo.save(job);

    await this.eventBus.publish(
      new PublishingJobCreatedEvent(job.id, {
        templateId: template.id,
        callId: rankedCall.call.id,
        rank,
        requiresApproval: job.requiresApproval,
      }),
    );

    this.logger.log(
      `Created publishing job: ${job.id} ` +
        `(template: ${template.name}, call: ${rankedCall.call.ticker}, rank: ${rank})`,
    );
  }

  /**
   * Get pending approvals for template (for UI)
   */
  async getPendingApprovals(
    templateId: TemplateId,
  ): Promise<PendingApproval[]> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new TemplateNotFoundException(templateId);
    }

    const jobs = await this.publishingJobRepo.findPending({
      templateId,
      requiresApproval: true,
    });

    return jobs.map((job) => ({
      jobId: job.id,
      callId: job.callId,
      templateName: template.name,
      rank: job.rank,
      score: job.score,
      ticker: job.ticker,
      createdAt: job.createdAt,
    }));
  }

  /**
   * Get template rankings (for UI)
   */
  async getTemplateRankings(templateId: TemplateId): Promise<RankedCall[]> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new TemplateNotFoundException(templateId);
    }

    const calls = await this.scoredCallRepo.findRecent({
      limit: 100,
      maxAge: 86400,
    });

    return template.rankCalls(calls);
  }
}
```

---

### Ranking Engine Service

```typescript
// templates/application/services/ranking-engine.service.ts

@Injectable()
export class RankingEngineService {
  /**
   * Rank calls according to strategy
   */
  rank(calls: ScoredCall[], config: RankingConfig): RankedCall[] {
    switch (config.strategy) {
      case 'score-desc':
        return this.rankByScore(calls, config);

      case 'engagement':
        return this.rankByEngagement(calls, config);

      case 'recency':
        return this.rankByRecency(calls, config);

      case 'weighted':
        return this.rankWeighted(calls, config);

      default:
        throw new UnsupportedRankingStrategyException(config.strategy);
    }
  }

  private rankByScore(
    calls: ScoredCall[],
    config: RankingConfig,
  ): RankedCall[] {
    const filtered = this.applyFilters(calls, config.filters);

    const sorted = filtered.sort((a, b) => b.score - a.score);

    return sorted.map((call, index) => ({
      call,
      rank: index + 1,
      score: call.score,
      rankingStrategy: 'score-desc',
    }));
  }

  private rankByEngagement(
    calls: ScoredCall[],
    config: RankingConfig,
  ): RankedCall[] {
    const filtered = this.applyFilters(calls, config.filters);

    // Engagement = views + reactions + forwards (from tracking data)
    const sorted = filtered.sort(
      (a, b) => b.engagementScore - a.engagementScore,
    );

    return sorted.map((call, index) => ({
      call,
      rank: index + 1,
      score: call.engagementScore,
      rankingStrategy: 'engagement',
    }));
  }

  private rankByRecency(
    calls: ScoredCall[],
    config: RankingConfig,
  ): RankedCall[] {
    const filtered = this.applyFilters(calls, config.filters);

    const sorted = filtered.sort(
      (a, b) => b.scoredAt.getTime() - a.scoredAt.getTime(),
    );

    return sorted.map((call, index) => ({
      call,
      rank: index + 1,
      score: this.calculateRecencyScore(call),
      rankingStrategy: 'recency',
    }));
  }

  private rankWeighted(
    calls: ScoredCall[],
    config: RankingConfig,
  ): RankedCall[] {
    const filtered = this.applyFilters(calls, config.filters);

    const weights = config.weights!;

    const scored = filtered.map((call) => {
      const scoreComponent = call.score * weights.score;
      const engagementComponent = call.engagementScore * weights.engagement;
      const recencyComponent =
        this.calculateRecencyScore(call) * weights.recency;

      return {
        call,
        weightedScore: scoreComponent + engagementComponent + recencyComponent,
      };
    });

    const sorted = scored.sort((a, b) => b.weightedScore - a.weightedScore);

    return sorted.map((item, index) => ({
      call: item.call,
      rank: index + 1,
      score: item.weightedScore,
      rankingStrategy: 'weighted',
    }));
  }

  private applyFilters(
    calls: ScoredCall[],
    filters: RankingFilters,
  ): ScoredCall[] {
    return calls.filter((call) => {
      if (filters.minScore && call.score < filters.minScore) return false;
      if (filters.maxAge) {
        const age = (Date.now() - call.scoredAt.getTime()) / 1000;
        if (age > filters.maxAge) return false;
      }
      return true;
    });
  }

  private calculateRecencyScore(call: ScoredCall): number {
    const ageSeconds = (Date.now() - call.scoredAt.getTime()) / 1000;
    const ageHours = ageSeconds / 3600;

    // Exponential decay: 100 at 0h, 50 at 12h, 25 at 24h
    return 100 * Math.exp(-0.0578 * ageHours);
  }
}
```

---

### Template API Endpoints

```typescript
// templates/api/controllers/templates.controller.ts

@Controller('api/templates')
@UseGuards(AuthGuard) // Require authentication
export class TemplatesController {
  constructor(
    private readonly createTemplate: CreateTemplateUseCase,
    private readonly updateTemplate: UpdateTemplateUseCase,
    private readonly activateTemplate: ActivateTemplateUseCase,
    private readonly getTemplateRankings: GetTemplateRankingsUseCase,
    private readonly listTemplates: ListTemplatesUseCase,
  ) {}

  /**
   * GET /api/templates
   * List all templates (active + inactive)
   */
  @Get()
  async list(@Query() query: ListTemplatesQuery) {
    const templates = await this.listTemplates.execute({
      activeOnly: query.activeOnly === 'true',
      includeStats: query.includeStats === 'true',
    });

    return {
      templates: templates.map((t) => ({
        id: t.id.value,
        name: t.name,
        description: t.description,
        active: t.active,
        sourceConfig: t.sourceConfig,
        rankingConfig: t.rankingConfig,
        approvalMode: t.approvalConfig.mode,
        botChatId: t.publishingConfig.chatId,
        createdAt: t.createdAt,
        stats: t.stats, // If includeStats=true
      })),
    };
  }

  /**
   * GET /api/templates/:id
   * Get single template with full config
   */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const template = await this.listTemplates.findById(id);

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return {
      id: template.id.value,
      name: template.name,
      description: template.description,
      active: template.active,
      sourceConfig: template.sourceConfig,
      pipelineConfig: template.pipelineConfig,
      rankingConfig: template.rankingConfig,
      approvalConfig: template.approvalConfig,
      publishingConfig: {
        ...template.publishingConfig,
        botToken: '***', // Redact sensitive
      },
      monitoringConfig: template.monitoringConfig,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * POST /api/templates
   * Create new template
   */
  @Post()
  @UsePipes(new ValidationPipe())
  async create(@Body() dto: CreateTemplateDto, @CurrentUser() user: User) {
    const template = await this.createTemplate.execute({
      name: dto.name,
      description: dto.description,
      sourceConfig: dto.sourceConfig,
      pipelineConfig: dto.pipelineConfig,
      rankingConfig: dto.rankingConfig,
      approvalConfig: dto.approvalConfig,
      publishingConfig: dto.publishingConfig,
      monitoringConfig: dto.monitoringConfig,
      createdBy: user.id,
    });

    return {
      id: template.id.value,
      message: 'Template created successfully (inactive by default)',
    };
  }

  /**
   * PATCH /api/templates/:id
   * Update template configuration
   */
  @Patch(':id')
  @UsePipes(new ValidationPipe())
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    await this.updateTemplate.execute({
      templateId: id,
      updates: dto,
    });

    return { message: 'Template updated successfully' };
  }

  /**
   * POST /api/templates/:id/activate
   * Activate template (start processing)
   */
  @Post(':id/activate')
  async activate(@Param('id') id: string) {
    await this.activateTemplate.execute({ templateId: id });
    return { message: 'Template activated' };
  }

  /**
   * POST /api/templates/:id/deactivate
   * Deactivate template (stop processing)
   */
  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    await this.activateTemplate.execute({
      templateId: id,
      active: false,
    });
    return { message: 'Template deactivated' };
  }

  /**
   * GET /api/templates/:id/rankings
   * Get current ranked calls for template (for UI preview)
   */
  @Get(':id/rankings')
  async getRankings(@Param('id') id: string) {
    const rankings = await this.getTemplateRankings.execute({
      templateId: id,
    });

    return {
      templateId: id,
      rankings: rankings.map((r, index) => ({
        rank: index + 1,
        callId: r.call.id.value,
        ticker: r.call.ticker,
        score: r.score,
        kol: r.call.kolName,
        ingestedAt: r.call.ingestedAt,
        age: this.calculateAge(r.call.ingestedAt),
      })),
    };
  }

  /**
   * GET /api/templates/:id/pending-approvals
   * Get calls pending manual approval for this template
   */
  @Get(':id/pending-approvals')
  async getPendingApprovals(@Param('id') id: string) {
    const approvals = await this.getTemplateRankings.getPendingApprovals(id);

    return {
      templateId: id,
      pendingCount: approvals.length,
      approvals: approvals.map((a) => ({
        jobId: a.jobId.value,
        callId: a.callId.value,
        ticker: a.ticker,
        score: a.score,
        rank: a.rank,
        createdAt: a.createdAt,
        actions: {
          approve: `/api/approvals/${a.jobId.value}/approve`,
          reject: `/api/approvals/${a.jobId.value}/reject`,
        },
      })),
    };
  }

  /**
   * DELETE /api/templates/:id
   * Delete template (soft delete: mark inactive + archived)
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    // Soft delete (keep historical data)
    await this.updateTemplate.execute({
      templateId: id,
      updates: { active: false, archived: true },
    });

    return { message: 'Template archived successfully' };
  }

  private calculateAge(date: Date): string {
    const seconds = (Date.now() - date.getTime()) / 1000;
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}
```

---

## 📋 Event-Driven Pipeline (Template-Aware)

### Event Flow (Complete, Template-Aware)

```
1. ingestion.kol-message.ingested
   ↓
2. extraction.candidates.extracted
   ↓
3. parsing.call.parsed
   ↓
4. normalization.call.normalized
   ↓
5. enrichment.call.enriched (or enrichment.call.failed)
   ↓
6. classification.call.classified
   ↓
7. scoring.call.scored
   ↓
8. ⭐ templates.orchestrator.process  # NEW: Template orchestrator
   ├─ For each active template:
   │   ├─ Filter calls by sourceConfig
   │   ├─ Rank by rankingConfig
   │   └─ Create PublishingJob per ranked call
   ↓
9. approval.job.pending-approval (if manual)
   OR
   approval.job.auto-approved (if auto)
   ↓
10. publishing.job.published (or publishing.job.failed)
   ↓
11. tracking.evaluation.completed
```

**Template Orchestrator** (runs every 1 minute):

- Loads all active templates
- For each template, processes scored calls independently
- Creates publishing jobs based on template config
- Respects rate limits per template

### Event Definitions

```typescript
// shared/domain/events/
export abstract class DomainEvent {
  public readonly occurredOn: Date;
  public readonly aggregateId: string;

  constructor(aggregateId: string) {
    this.aggregateId = aggregateId;
    this.occurredOn = new Date();
  }

  abstract get eventName(): string;
}

// ingestion/domain/events/kol-message-ingested.event.ts
export class KolMessageIngestedEvent extends DomainEvent {
  constructor(
    public readonly payload: {
      kolId: string;
      channelId: string;
      messageId: string;
      rawText: string;
      ingestedAt: Date;
    },
  ) {
    super(`${payload.kolId}-${payload.messageId}`);
  }

  get eventName(): string {
    return 'ingestion.kol-message.ingested';
  }
}

// extraction/domain/events/candidates-extracted.event.ts
export class CandidatesExtractedEvent extends DomainEvent {
  constructor(
    public readonly payload: {
      kolId: string;
      messageId: string;
      candidates: Array<{
        ticker: string;
        chainHint?: string;
        contractAddress?: string;
      }>;
      extractedAt: Date;
    },
  ) {
    super(`${payload.kolId}-${payload.messageId}`);
  }

  get eventName(): string {
    return 'extraction.candidates.extracted';
  }
}

// parsing/domain/events/call-parsed.event.ts
export class CallParsedEvent extends DomainEvent {
  constructor(
    public readonly payload: {
      callId: string;
      kolId: string;
      ticker: string;
      chainId?: string;
      contractAddress?: string;
      parsedAt: Date;
    },
  ) {
    super(payload.callId);
  }

  get eventName(): string {
    return 'parsing.call.parsed';
  }
}

// ... (similar para cada BC)
```

---

## 🗂️ Database Schema (22 Tablas + Template System)

| BC             | Tabla                     | Descripción                                            |
| -------------- | ------------------------- | ------------------------------------------------------ |
| extraction     | `extraction_candidates`   | Candidatos extraídos desde raw text                    |
| parsing        | `parsed_calls`            | Calls parseados estructurados                          |
| normalization  | `normalized_calls`        | Calls normalizados                                     |
| enrichment     | `enriched_calls`          | Calls con token/chain metadata                         |
| classification | `classified_calls`        | Calls clasificados (risk level)                        |
| scoring        | `scored_calls`            | Calls con score calculado                              |
| **templates**  | `publishing_templates`    | 🆕 Template configurations                             |
| **templates**  | `template_source_filters` | 🆕 Source filters per template (N:1)                   |
| approval       | `call_approvals`          | Decisiones de approval/rejection                       |
| publishing     | `publishing_jobs`         | 🔄 Jobs de publishing (template-based)                 |
| publishing     | `published_calls`         | Calls publicados (messageId, publishedAt)              |
| tracking       | `call_tracking`           | Tracking de performance (price snapshots)              |
| tracking       | `call_evaluations`        | Evaluaciones de calls (ROI, success)                   |
| kol-identity   | `kols`                    | KOL profiles                                           |
| kol-identity   | `kol_channels`            | Telegram channels per KOL                              |
| kol-identity   | `kol_reputation`          | Reputation scoring per KOL                             |
| kol-identity   | `kol_stats`               | Statistics per KOL (calls count, success rate)         |
| shared         | `event_store`             | Event sourcing store (opcional, v2)                    |
| shared         | `integration_events`      | Integration event log (audit trail)                    |
| config         | `pipeline_config`         | Global pipeline settings (enabled flags)               |
| config         | `scoring_rules`           | Configurable scoring rules (deprecated with templates) |
| monitoring     | `template_metrics`        | 🆕 Per-template metrics (publish rate, etc.)           |

**Total v1**: **22 tablas** (18 original + 4 template system)

### Template System Tables (Detalle)

```sql
-- publishing_templates
CREATE TABLE publishing_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT FALSE,

  -- Source Config (JSONB for flexibility)
  source_config JSONB NOT NULL,  -- { type, filters: { kolIds, minReputation, tiers, excludeKolIds } }

  -- Pipeline Config
  pipeline_config JSONB NOT NULL,  -- { enabledSteps, scoringRules, enrichmentConfig, classificationEnabled }

  -- Ranking Config
  ranking_config JSONB NOT NULL,  -- { strategy, limit, filters, weights }

  -- Approval Config
  approval_config JSONB NOT NULL,  -- { mode, autoApprovalRules, reviewers }

  -- Publishing Config (bot tokens stored in vault, referenced here)
  publishing_config JSONB NOT NULL,  -- { botToken, chatId, messageFormat, customTemplate, rateLimits, retryConfig }

  -- Monitoring Config
  monitoring_config JSONB,  -- { metricsEnabled, alerting, webhooks }

  -- Metadata
  created_by UUID NOT NULL,  -- User ID
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE,

  CONSTRAINT valid_source_config CHECK (source_config ? 'type'),
  CONSTRAINT valid_ranking_strategy CHECK (
    ranking_config->>'strategy' IN ('score-desc', 'engagement', 'recency', 'weighted')
  ),
  CONSTRAINT valid_approval_mode CHECK (
    approval_config->>'mode' IN ('manual', 'auto', 'hybrid')
  )
);

CREATE INDEX idx_templates_active ON publishing_templates(active) WHERE active = TRUE;
CREATE INDEX idx_templates_name ON publishing_templates(name);
CREATE INDEX idx_templates_created_by ON publishing_templates(created_by);

-- template_source_filters (si necesitas queries eficientes por KOL)
CREATE TABLE template_source_filters (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES publishing_templates(id) ON DELETE CASCADE,
  kol_id UUID NOT NULL,  -- Foreign key to kols table
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(template_id, kol_id)
);

CREATE INDEX idx_template_filters_template ON template_source_filters(template_id);
CREATE INDEX idx_template_filters_kol ON template_source_filters(kol_id);

-- publishing_jobs (REFACTORED: ahora incluye template_id)
CREATE TABLE publishing_jobs (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES publishing_templates(id),  -- 🆕
  call_id UUID NOT NULL,  -- References scored_calls

  -- Job state
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | published | failed
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  rank INTEGER,  -- Ranking position in template

  -- Publishing metadata
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  telegram_message_id BIGINT,

  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'published', 'failed')
  ),
  CONSTRAINT unique_call_per_template UNIQUE(template_id, call_id)  -- 🆕
);

CREATE INDEX idx_jobs_template ON publishing_jobs(template_id);
CREATE INDEX idx_jobs_status ON publishing_jobs(status);
CREATE INDEX idx_jobs_pending_approval ON publishing_jobs(template_id, status)
  WHERE status = 'pending' AND requires_approval = TRUE;
CREATE INDEX idx_jobs_scheduled ON publishing_jobs(scheduled_at)
  WHERE status = 'approved' AND scheduled_at IS NOT NULL;

-- template_metrics (para monitoring)
CREATE TABLE template_metrics (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES publishing_templates(id),

  -- Counters
  jobs_created INTEGER DEFAULT 0,
  jobs_approved INTEGER DEFAULT 0,
  jobs_rejected INTEGER DEFAULT 0,
  jobs_published INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,

  -- Rates
  publish_rate_24h DECIMAL(5,2),  -- Calls per day
  approval_rate DECIMAL(5,4),     -- approved / (approved + rejected)
  success_rate DECIMAL(5,4),      -- published / approved

  -- Aggregates
  avg_score DECIMAL(5,2),
  avg_rank DECIMAL(5,2),

  -- Time window
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_template_period UNIQUE(template_id, period_start)
);

CREATE INDEX idx_metrics_template ON template_metrics(template_id);
CREATE INDEX idx_metrics_period ON template_metrics(period_start, period_end);
```

---

## 🔗 Relación con `refactor-content-publisher`

### Actualizar Referencias en Content-Publisher Spec

El spec de `refactor-content-publisher` menciona KOL en varios lugares. **Actualizar** con referencias al nuevo `kol-system`:

#### Ubicación: `refactor-content-publisher/11-refactor.md`

**ANTES** (líneas que mencionan KOL):

```markdown
├── telegram/ # Bot API adapters (crypto-news + kol + threads)
```

**DESPUÉS** (agregar nota):

```markdown
├── telegram/ # Bot API adapters (crypto-news + threads) # NOTA: KOL bot adapter movido a apps/kol-system/ # Ver: .kiro/specs/refactor-kol-system/overview.md
```

---

**ANTES** (Ingestion Module, línea ~104):

```markdown
// KOL (para threads en futuro)
getKolMessages(params: { limit: number; kolId?: string }): Promise<KolMessage[]>;
getActiveKols(): Promise<Kol[]>;
```

**DESPUÉS** (agregar deprecation note):

```markdown
// KOL (DEPRECADO — movido a apps/kol-system/)
// Estos métodos permanecen solo para backward compatibility durante migración
// ELIMINAR en v2.0.0 cuando kol-system esté en prod
// Ver: .kiro/specs/refactor-kol-system/overview.md
getKolMessages(params: { limit: number; kolId?: string }): Promise<KolMessage[]>;
getActiveKols(): Promise<Kol[]>;
```

---

**ANTES** (Threads Module, línea ~812):

```markdown
- `telegram/` — Bot API publishing (KOL adapter)
```

**DESPUÉS**:

```markdown
- `telegram/` — Bot API publishing (threads bot adapter)
  NOTA: Para KOL calls, ver apps/kol-system/ (pipeline completo independiente)
```

---

**ANTES** (Threads Module, línea ~836):

```markdown
6. **Bot selection** — Threads usan **KOL bot por defecto** (`KOL_BOT_TOKEN`).
```

**DESPUÉS**:

```markdown
6. **Bot selection** — Threads usan **threads bot token** (`THREADS_BOT_TOKEN`).
   NOTA: El token KOL_BOT_TOKEN ahora es propiedad de apps/kol-system/ para VIP calls.
   Los threads (contenido largo-form de KOLs) usan un bot dedicado separado.
```

---

**ANTES** (Telegram Module, línea ~872):

```markdown
│ ├── crypto-news-bot-publisher.service.ts # Crypto-news dedicated
│ └── kol-bot-publisher.service.ts # KOL dedicated (threads)
```

**DESPUÉS**:

```markdown
│ ├── crypto-news-bot-publisher.service.ts # Crypto-news dedicated
│ └── threads-bot-publisher.service.ts # Threads dedicated # (RENOMBRADO desde kol-bot-publisher) # KOL VIP calls ahora en apps/kol-system/
```

---

**ANTES** (Telegram Module, línea ~879):

```markdown
│ ├── crypto-news-bot-api.adapter.ts # CRYPTO_NEWS_BOT_TOKEN
│ └── kol-bot-api.adapter.ts # KOL_BOT_TOKEN (threads)
```

**DESPUÉS**:

```markdown
│ ├── crypto-news-bot-api.adapter.ts # CRYPTO_NEWS_BOT_TOKEN
│ └── threads-bot-api.adapter.ts # THREADS_BOT_TOKEN # (RENOMBRADO desde kol-bot-api)
```

---

**ANTES** (Telegram Module, línea ~903):

```markdown
- ✅ **Separate bot tokens** — Crypto-news (`CRYPTO_NEWS_BOT_TOKEN`) + KOL (`KOL_BOT_TOKEN`)
```

**DESPUÉS**:

```markdown
- ✅ **Separate bot tokens** — Crypto-news (`CRYPTO_NEWS_BOT_TOKEN`) + Threads (`THREADS_BOT_TOKEN`)
  NOTA: `KOL_BOT_TOKEN` (para VIP calls) ahora vive en apps/kol-system/
```

---

#### Ubicación: `refactor-content-publisher/IMPLEMENTATION-GUIDE.md`

**AGREGAR** nueva sección en "Related Refactors":

```markdown
## Related Refactors

### KOL System Refactor

El refactor de content-publisher se enfoca en **crypto-news + threads**.  
Para **KOL VIP calls** (extraction → parsing → scoring → approval → publishing), ver:

→ [refactor-kol-system/overview.md](../refactor-kol-system/overview.md)

**Decisión de Separación**:

- ✅ **Content-publisher** = Multi-content publishing (crypto-news + threads + futuro)
- ✅ **KOL-system** = Pipeline completo alpha-call (ingestion → approval → publishing → tracking)
- ✅ Sin overlap — diferentes dominios, diferentes pipelines, diferentes bots

**Shared Dependencies**:

- Ambos consumen `ingestion-telegram` vía HTTP + SSE
- Ambos usan Bot API (diferentes tokens: `CRYPTO_NEWS_BOT_TOKEN` vs `VIP_CALLS_BOT_TOKEN`)
- Shared nothing más allá de infra (postgres, redis)
```

---

## 📐 Estructura Hexagonal (Convenciones NestJS)

### Anatomía de un BC (Ejemplo: `extraction/`)

```
extraction/
├── domain/                           # Capa de dominio (entities, VOs, events, ports)
│   ├── entities/
│   │   └── extraction-candidate.entity.ts    # DDD aggregate root
│   ├── value-objects/
│   │   ├── candidate-ticker.vo.ts
│   │   └── extraction-confidence.vo.ts
│   ├── events/
│   │   └── candidates-extracted.event.ts
│   └── ports/
│       └── extraction-repository.port.ts     # Interface (abstracts infrastructure)
│
├── application/                      # Capa de aplicación (use cases, services)
│   ├── use-cases/
│   │   └── extract-from-message.use-case.ts  # Command handler (orchestrates domain)
│   ├── services/
│   │   └── candidate-extractor.service.ts    # Domain service (business logic)
│   └── handlers/
│       └── kol-message-ingested.handler.ts   # Event handler (listens to events)
│
├── infrastructure/                   # Capa de infraestructura (adapters, persistence)
│   ├── persistence/
│   │   └── typeorm/
│   │       ├── entities/
│   │       │   └── extraction-candidate.entity.ts  # ORM entity (DB schema)
│   │       └── repositories/
│   │           └── typeorm-extraction.repository.ts  # Port implementation
│   └── ml/
│       └── regex-extractor.adapter.ts        # External service adapter
│
├── api/                              # Capa de API (opcional, solo si expone endpoints)
│   ├── controllers/
│   │   └── extraction.controller.ts          # HTTP REST controller
│   └── dto/
│       ├── extract-request.dto.ts
│       └── extract-response.dto.ts
│
└── extraction.module.ts              # NestJS module (dependency injection)
```

### Convenciones de Naming

| Layer        | Pattern                           | Ejemplo                            |
| ------------ | --------------------------------- | ---------------------------------- |
| Aggregate    | `{concept}.aggregate.ts`          | `normalized-call.aggregate.ts`     |
| Entity       | `{concept}.entity.ts`             | `extraction-candidate.entity.ts`   |
| Value Object | `{concept}.vo.ts`                 | `candidate-ticker.vo.ts`           |
| Event        | `{action}-{past-tense}.event.ts`  | `candidates-extracted.event.ts`    |
| Port         | `{concept}-repository.port.ts`    | `extraction-repository.port.ts`    |
| Use Case     | `{verb}-{noun}.use-case.ts`       | `extract-from-message.use-case.ts` |
| Service      | `{concept}.service.ts`            | `candidate-extractor.service.ts`   |
| Handler      | `{event-name}.handler.ts`         | `kol-message-ingested.handler.ts`  |
| Repository   | `typeorm-{concept}.repository.ts` | `typeorm-extraction.repository.ts` |
| Adapter      | `{provider}-{concept}.adapter.ts` | `helius-token-metadata.adapter.ts` |
| Controller   | `{resource}.controller.ts`        | `extraction.controller.ts`         |
| DTO          | `{action}-{resource}.dto.ts`      | `extract-request.dto.ts`           |
| Module       | `{bc-name}.module.ts`             | `extraction.module.ts`             |

---

## 🚀 Orden de Implementación (11 Fases, Template-Based)

### **Phase 1: App Setup + Shared Module** (1 semana)

1. Crear esqueleto `apps/kol-system/`
2. `package.json` + dependencias
3. `main.ts` + `app.module.ts` (puerto :3050 dev)
4. Healthcheck `/api/health`
5. Shared module (VOs, events base, exceptions, utils)

**Validación**: `curl localhost:3050/api/health` → 200 OK

---

### **Phase 2: Ingestion Module** (3 días)

1. `KolIngestionClient` (HTTP to ingestion-telegram)
2. `IngestionSseListenerAdapter` (SSE subscriber)
3. `ProcessKolMessageHandler` (event emitter)

**Validación**: Logs muestran conexión SSE exitosa + eventos `ingestion.kol-message.ingested`

---

### **Phase 3: Extraction BC** (3 días)

1. Domain: `ExtractionCandidate` aggregate + event
2. Application: `ExtractFromMessageUseCase`
3. Infrastructure: TypeORM entity + repository
4. Handler: `KolMessageIngestedHandler` (escucha ingestion events)

**Validación**: Raw message → extrae candidatos (ticker + chain hint) → persiste en DB

---

### **Phase 4: Parsing BC** (3 días)

1. Domain: `ParsedCall` aggregate + event
2. Application: `ParseFromCandidatesUseCase`
3. Infrastructure: TypeORM entity + repository
4. Handler: `CandidatesExtractedHandler`

**Validación**: Candidatos → parsea call estructurado → emite `parsing.call.parsed`

---

### **Phase 5: Normalization BC** (3 días)

1. Domain: `NormalizedCall` aggregate + event
2. Application: `NormalizeCallUseCase`
3. Infrastructure: TypeORM entity + repository
4. Handler: `CallParsedHandler`

**Validación**: Parsed call → normaliza ticker/chain → emite `normalization.call.normalized`

---

### **Phase 6: Enrichment BC** (5 días)

1. Domain: `EnrichedCall` aggregate + events (enriched/failed)
2. Application: `EnrichCallUseCase` + `TokenEnrichmentService`
3. Infrastructure: HTTP adapters (Helius, DexScreener, Birdeye)
4. Handler: `CallNormalizedHandler`

**Validación**: Normalized call → fetch token metadata → enrich o fail

---

### **Phase 7: Classification + Scoring** (4 días)

1. **Classification BC**:
   - Domain: `ClassifiedCall` + event
   - Application: `ClassifyCallUseCase`
   - Infrastructure: ONNX adapter

2. **Scoring BC**:
   - Domain: `ScoredCall` + event
   - Application: `ScoreCallUseCase` + `ScoringEngine`
   - Infrastructure: TypeORM persistence

**Validación**: Enriched call → classify → score → emite `scoring.call.scored`

---

### **Phase 8: Templates BC** ⭐ (5 días, **CORE del sistema robusto**)

1. **Domain** (2 días):
   - `PublishingTemplate` aggregate (full model con 6 configs)
   - Value Objects: `SourceConfig`, `PipelineConfig`, `RankingConfig`, `ApprovalConfig`, `PublishingConfig`, `MonitoringConfig`
   - Events: `TemplateCreated`, `TemplateActivated`, `TemplateSourceConfigUpdated`, etc.

2. **Application** (2 días):
   - `CreateTemplateUseCase`
   - `UpdateTemplateUseCase`
   - `ActivateTemplateUseCase`
   - `GetTemplateRankingsUseCase`
   - `TemplateOrchestratorService` (CRITICAL: main orchestrator)
   - `RankingEngineService` (4 strategies: score-desc, engagement, recency, weighted)

3. **Infrastructure** (1 día):
   - TypeORM entities: `publishing_templates`, `template_source_filters`, `template_metrics`
   - Repositories: `TemplateRepository`, `TemplateMetricsRepository`

4. **API**:
   - `TemplatesController` (CRUD + rankings + pending-approvals)
   - DTOs: `CreateTemplateDto`, `UpdateTemplateDto`

5. **Cron Scheduler**:
   - `TemplateProcessingScheduler` (every 1 minute, calls `TemplateOrchestratorService`)

**Validación**:

- Crear template vía API → activate → verify scheduler runs → check logs
- Manually score a call → verify template ranks it → creates publishing job
- GET `/api/templates/:id/rankings` → returns ranked calls

**ESTE ES EL PHASE MÁS CRÍTICO** — Sin esto, no hay template system.

---

### **Phase 9: Approval BC** (3 días, template-aware)

1. Domain: `CallApproval` + events (approved/rejected)
2. Application: `EvaluateApprovalUseCase`, `GetPendingApprovalsUseCase`
3. Infrastructure: TypeORM persistence
4. Handler: `CallScoredHandler` → template orchestrator triggers approvals
5. API: `ApprovalsController` (approve/reject endpoints)

**Validación**: Publishing job created → check requires_approval → UI can approve/reject

---

### **Phase 10: Publishing BC** (4 días, multi-bot)

1. Domain: `PublishingJob` + events (published/failed)
2. Application: `PublishFromTemplateUseCase`, `ManualPublishUseCase`
3. Infrastructure: `MultiBotPublisherAdapter` (N bots simultaneously)
4. Handler: `JobApprovedHandler`
5. Cron: `PublishingScheduler` (drain approved jobs)

**Validación**: Approved job → publish to Telegram (correct bot per template) → finalize

---

### **Phase 11: Tracking BC + KOL Identity** (5 días)

1. **Tracking BC**:
   - Domain: `CallTracking` + event
   - Application: `TrackCallUseCase` + `EvaluatePerformanceUseCase`
   - Infrastructure: TypeORM persistence

2. **KOL Identity BC** (migrado desde backend):
   - Mover `apps/backend/src/kol/` completo
   - Renombrar a `kol-identity/`
   - Adaptar a nueva estructura hexagonal

**Validación**: Published call → track price snapshots → evaluate ROI

---

## 🔧 Environment Variables (Template-Based)

```bash
# kol-system/.env.example

# App
NODE_ENV=development
PORT=3050
LOG_LEVEL=debug

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=kol_system_dev
DATABASE_ENABLED=true
DATABASE_SYNCHRONIZE=true    # false en staging/prod

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_ENABLED=true

# Ingestion-telegram connection
INGESTION_TELEGRAM_URL=http://localhost:3031
INGESTION_TELEGRAM_ENABLED=true

# Telegram Bot API (Multi-Bot Support)
# Template-specific tokens stored in DB (publishing_templates.publishing_config)
# These are defaults for dev/testing:
DEFAULT_BOT_TOKEN=your-default-bot-token
DEFAULT_CHAT_ID=your-default-channel-id

# External APIs (Token Enrichment)
HELIUS_API_KEY=your-helius-key
DEXSCREENER_BASE_URL=https://api.dexscreener.com
BIRDEYE_API_KEY=your-birdeye-key

# LLM Gateway (opcional, para classification)
LLM_GATEWAY_URL=http://localhost:8000
LLM_GATEWAY_ENABLED=false

# Pipeline Config (Global defaults, overridable per template)
EXTRACTION_ENABLED=true
PARSING_ENABLED=true
NORMALIZATION_ENABLED=true
ENRICHMENT_ENABLED=true
CLASSIFICATION_ENABLED=true  # Can be disabled per template
SCORING_ENABLED=true
TRACKING_ENABLED=true

# Template System Config
TEMPLATE_ORCHESTRATOR_ENABLED=true
TEMPLATE_PROCESSING_INTERVAL=60000  # 1 min in ms
TEMPLATE_MAX_CONCURRENT=5           # Max templates processing simultaneously

# Scoring Config (Global defaults, overridable per template)
SCORING_BASE=50
SCORING_TIER_HIGH=80
SCORING_TIER_MEDIUM=60
SCORING_TIER_LOW=40
SCORING_REP_MIN=0.85
SCORING_REP_MAX=1.15

# Rate Limiting (Global defaults, overridable per template)
GLOBAL_MAX_PUBLISHES_PER_HOUR=20
GLOBAL_MAX_PUBLISHES_PER_DAY=100

# Monitoring
METRICS_ENABLED=true
GRAFANA_WEBHOOK_URL=https://hooks.grafana.com/...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Security
JWT_SECRET=your-jwt-secret-for-api-auth
API_KEY=your-api-key-for-frontend
ENABLE_AUTH=true  # Set false in dev for testing
```

**Notas sobre Bot Tokens**:

- Bot tokens específicos de cada template se guardan en la DB (`publishing_templates.publishing_config.botToken`)
- Tokens se cifran en reposo (usar `@nestjs/encryption` o AWS Secrets Manager en prod)
- Frontend nunca ve los tokens (redacted en API responses)
- `DEFAULT_BOT_TOKEN` solo para dev/testing (no usar en prod)

---

## 📊 Migración desde Backend

### Módulos a Migrar

| Backend Source                             | KOL-System Destination      | BC       | Líneas     | Archivos |
| ------------------------------------------ | --------------------------- | -------- | ---------- | -------- |
| `apps/backend/src/kol/identity/`           | `kol-identity/`             | Identity | ~2500      | 18       |
| `apps/backend/src/kol/reputation/`         | `kol-identity/`             | Identity | ~800       | 6        |
| `apps/backend/src/kol/source/`             | `kol-identity/`             | Identity | ~600       | 4        |
| `apps/backend/src/kol/stats/`              | `kol-identity/`             | Identity | ~400       | 3        |
| `apps/backend/src/telegram/ingestion/kol/` | `extraction/` + `parsing/`  | Multiple | ~3200      | 22       |
| `apps/backend/src/telegram/vip-calls/`     | `publishing/` + `approval/` | Multiple | ~4500      | 31       |
| Scattered enrichment/scoring logic         | `enrichment/` + `scoring/`  | Multiple | ~2000      | 14       |
| **Total**                                  | —                           | —        | **~14000** | **98**   |

### Estrategia de Migración (Dual-Write Period)

#### Fase 1: Marcar como @deprecated (Semana 1)

Agregar headers en TODOS los archivos que serán migrados:

```typescript
/**
 * @deprecated Moved to apps/kol-system/
 * Use KolSystemModule from kol-system app instead.
 * This service will be removed in v3.0.0 (ETA: 2026-11-30)
 *
 * Migration guide: /docs/migrations/backend-kol-to-kol-system.md
 *
 * @see {@link apps/kol-system/src/kol-identity/}
 */
```

#### Fase 2: Dual-Write Period (Semanas 2-6)

- Backend continúa funcionando (legacy path)
- `kol-system` recibe MISMOS eventos vía `ingestion-telegram`
- Comparar resultados (publish side-by-side, log divergencias)
- NO eliminar código backend todavía

#### Fase 3: Cutover (Semana 7)

- Habilitar `kol-system` en producción
- Deshabilitar pipeline KOL en backend (`KOL_PIPELINE_ENABLED=false`)
- Monitoring 48h (error rate, latency, publish rate)

#### Fase 4: Cleanup (Semana 8)

- Eliminar código deprecated del backend
- Archivar tablas legacy (NO drop, mover a schema `_archived`)
- Actualizar docs

---

## 🔗 Dependencias Cross-Service

### KOL-System → Ingestion-Telegram

- **Tipo**: HTTP API + SSE
- **Endpoints consumidos**:
  - `GET /api/feed/kols`
  - `GET /api/feed/kol-messages`
  - `GET /api/ingestion/stream` (SSE)

### KOL-System → External APIs

- **Helius**: Token metadata (Solana)
- **DexScreener**: Token pricing
- **Birdeye**: Chain detection
- **Telegram Bot API**: VIP call publishing

### Backend (legacy) → KOL-System

- **Eliminar** después de migración completa
- Durante dual-write: backend NO debe llamar a `kol-system`

---

## 🖥️ Frontend UI Dashboard (Template Management)

### Template Management View

```typescript
// Frontend route: /templates

┌─────────────────────────────────────────────────────────┐
│ 📋 Publishing Templates                    [+ New]      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─ VIP Calls Alpha ──────────────────────── [Edit] ─┐  │
│ │ Status: ● Active                                    │  │
│ │ Sources: 3 KOLs (tier-1, reputation > 0.85)         │  │
│ │ Bot: @VIPCallsAlphaBot                              │  │
│ │ Approval: Manual                                    │  │
│ │ Ranking: Top 5 by score                             │  │
│ │                                                      │  │
│ │ 📊 Last 24h:                                        │  │
│ │ • Jobs Created: 12                                  │  │
│ │ • Pending Approval: 2                               │  │
│ │ • Published: 5                                      │  │
│ │ • Rejected: 3                                       │  │
│ │ • Publish Rate: 5.0/day                             │  │
│ │                                                      │  │
│ │ [View Rankings] [Pending Approvals (2)] [Pause]     │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Community Signals ──────────────────── [Edit] ──┐  │
│ │ Status: ● Active                                    │  │
│ │ Sources: 12 channels (tier-2 + tier-3)              │  │
│ │ Bot: @CommunitySignalsBot                           │  │
│ │ Approval: Auto (score > 70)                         │  │
│ │ Ranking: Top 10 by engagement                       │  │
│ │                                                      │  │
│ │ 📊 Last 24h:                                        │  │
│ │ • Jobs Created: 45                                  │  │
│ │ • Auto-Approved: 38                                 │  │
│ │ • Published: 35                                     │  │
│ │ • Failed: 3                                         │  │
│ │ • Publish Rate: 35.0/day                            │  │
│ │                                                      │  │
│ │ [View Rankings] [Metrics] [Pause]                   │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Experimental A/B Test ────────────── [Edit] ────┐  │
│ │ Status: ○ Inactive                                  │  │
│ │ Sources: Same as VIP Calls Alpha                    │  │
│ │ Bot: @ExperimentalBot                               │  │
│ │ Approval: Manual                                    │  │
│ │ Ranking: Weighted (score 0.5, engagement 0.3,       │  │
│ │          recency 0.2)                               │  │
│ │                                                      │  │
│ │ [Activate] [Delete]                                 │  │
│ └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Template Rankings View

```typescript
// Frontend route: /templates/:id/rankings

┌─────────────────────────────────────────────────────────┐
│ 📊 Rankings: VIP Calls Alpha             [Back]         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Ranking Strategy: Top 5 by score (desc)                 │
│ Last Updated: 2 minutes ago                              │
│ [Refresh]                                                │
│                                                          │
│ ┌────┬───────┬───────┬────────┬──────┬───────────────┐ │
│ │Rank│Ticker │ Score │  KOL   │ Age  │  Actions      │ │
│ ├────┼───────┼───────┼────────┼──────┼───────────────┤ │
│ │ 1  │ SOL   │  85   │ CryptoG│ 15m  │ [Details]     │ │
│ │ 2  │ BTC   │  82   │ AlphaKOL│ 23m │ [Details]     │ │
│ │ 3  │ ETH   │  78   │ CryptoG│ 1h   │ [Details]     │ │
│ │ 4  │ BONK  │  75   │ AlphaKOL│ 2h  │ [Details]     │ │
│ │ 5  │ WIF   │  72   │ DegenT │ 3h   │ [Details]     │ │
│ └────┴───────┴───────┴────────┴──────┴───────────────┘ │
│                                                          │
│ Note: These are candidates. Approval status may vary.   │
└─────────────────────────────────────────────────────────┘
```

### Pending Approvals View

```typescript
// Frontend route: /templates/:id/approvals

┌─────────────────────────────────────────────────────────┐
│ ✅ Pending Approvals: VIP Calls Alpha    [Back]         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 2 calls awaiting approval                                │
│                                                          │
│ ┌─ Call #1 ──────────────────────────────────────────┐ │
│ │ Ticker: SOL                                         │ │
│ │ Score: 85 | Rank: 1                                 │ │
│ │ KOL: CryptoGanster (reputation: 0.92)               │ │
│ │ Chain: Solana                                       │ │
│ │ Contract: So11111...                                │ │
│ │                                                      │ │
│ │ 📝 Raw Message:                                     │ │
│ │ "SOL is breaking out! $200 incoming 🚀"             │ │
│ │                                                      │ │
│ │ 📊 Token Metrics:                                   │ │
│ │ • Liquidity: $1.2M                                  │ │
│ │ • Holders: 5.4K                                     │ │
│ │ • Market Cap: $8.5M                                 │ │
│ │                                                      │ │
│ │ 📈 Enrichment Data:                                 │ │
│ │ • Price: $180.23 (+5.2% 24h)                        │ │
│ │ • Volume: $450K                                     │ │
│ │ • Risk Level: Low                                   │ │
│ │                                                      │ │
│ │ Created: 15 minutes ago                             │ │
│ │                                                      │ │
│ │ [✅ Approve] [❌ Reject] [⏸️ Skip]                  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Call #2 ──────────────────────────────────────────┐ │
│ │ Ticker: BTC                                         │ │
│ │ Score: 82 | Rank: 2                                 │ │
│ │ KOL: AlphaKOLCalls (reputation: 0.88)               │ │
│ │ ...                                                  │ │
│ │ [✅ Approve] [❌ Reject] [⏸️ Skip]                  │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Create/Edit Template Form

```typescript
// Frontend route: /templates/new or /templates/:id/edit

┌─────────────────────────────────────────────────────────┐
│ 📝 Create New Template                    [Cancel] [Save]│
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─ Basic Info ──────────────────────────────────────┐  │
│ │ Template Name: [VIP Calls Alpha            ]      │  │
│ │ Description:  [High-score KOL calls...      ]      │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Source Configuration ────────────────────────────┐  │
│ │ Source Type: ◉ KOL Filter  ○ Channel List         │  │
│ │                                                     │  │
│ │ ☑ Specific KOLs:                                  │  │
│ │   [Select KOLs ▼] (Selected: 3)                   │  │
│ │   • CryptoGanster                                  │  │
│ │   • AlphaKOLCalls                                  │  │
│ │   • DegenTrader                                    │  │
│ │                                                     │  │
│ │ ☑ Minimum Reputation:  [0.85  ]                   │  │
│ │                                                     │  │
│ │ ☑ Tiers:                                          │  │
│ │   ☑ Tier-1  ☐ Tier-2  ☐ Tier-3                   │  │
│ │                                                     │  │
│ │ Exclude KOLs: [Select...▼]                        │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Pipeline Configuration ──────────────────────────┐  │
│ │ Enabled Steps:                                     │  │
│ │ ☑ Extraction  ☑ Parsing  ☑ Normalization          │  │
│ │ ☑ Enrichment  ☐ Classification  ☑ Scoring         │  │
│ │                                                     │  │
│ │ Scoring Rules:                                     │  │
│ │ • Base Score:  [50  ]                             │  │
│ │ • Min Score:   [60  ] (fail-fast threshold)       │  │
│ │ • High Tier:   [80  ]                             │  │
│ │ • Medium Tier: [60  ]                             │  │
│ │ • Low Tier:    [40  ]                             │  │
│ │                                                     │  │
│ │ Enrichment Providers (cascade):                    │  │
│ │ 1. Helius  2. DexScreener  3. Birdeye             │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Ranking Configuration ───────────────────────────┐  │
│ │ Strategy: [Score (desc) ▼]                        │  │
│ │           (Options: Score, Engagement, Recency,    │  │
│ │            Weighted)                               │  │
│ │                                                     │  │
│ │ Top N Calls:  [5   ]                              │  │
│ │                                                     │  │
│ │ Filters:                                           │  │
│ │ • Min Score:  [70  ]                              │  │
│ │ • Max Age:    [3600] seconds                      │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Approval Configuration ──────────────────────────┐  │
│ │ Mode: ◉ Manual  ○ Auto  ○ Hybrid                  │  │
│ │                                                     │  │
│ │ Auto-Approval Rules (for Hybrid):                  │  │
│ │ ☐ Enable Auto-Approval                            │  │
│ │   • Min Score:      [80  ]                        │  │
│ │   • Max Per Day:    [10  ]                        │  │
│ │   • Min Age:        [300 ] seconds                │  │
│ │                                                     │  │
│ │ Reviewers: [Select users...▼]                     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Publishing Configuration ────────────────────────┐  │
│ │ Bot Token:       [********************] 🔒        │  │
│ │ Chat ID:         [-100123456         ]            │  │
│ │                                                     │  │
│ │ Message Format: ◉ Rich  ○ Simple  ○ Custom       │  │
│ │                                                     │  │
│ │ Rate Limits:                                       │  │
│ │ • Max Per Hour:  [5   ] calls                     │  │
│ │ • Max Per Day:   [20  ] calls                     │  │
│ │ • Min Interval:  [300 ] seconds                   │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Monitoring Configuration ────────────────────────┐  │
│ │ ☑ Enable Metrics                                  │  │
│ │                                                     │  │
│ │ Alerting:                                          │  │
│ │ ☑ Low Publish Rate (< 5 calls/day)                │  │
│ │ ☑ High Reject Rate (> 80%)                        │  │
│ │                                                     │  │
│ │ Webhook URLs:                                      │  │
│ │ [https://hooks.slack.com/... ]                    │  │
│ │ [+ Add Webhook]                                    │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│                          [Cancel]  [Save & Activate]    │
└─────────────────────────────────────────────────────────┘
```

### Frontend API Calls

```typescript
// Frontend services (TanStack Query hooks)

// List templates
const { data: templates } = useQuery({
  queryKey: ['templates'],
  queryFn: () => api.get('/api/templates'),
});

// Get template rankings
const { data: rankings } = useQuery({
  queryKey: ['template-rankings', templateId],
  queryFn: () => api.get(`/api/templates/${templateId}/rankings`),
  refetchInterval: 30000, // Refresh every 30s
});

// Get pending approvals
const { data: pendingApprovals } = useQuery({
  queryKey: ['pending-approvals', templateId],
  queryFn: () => api.get(`/api/templates/${templateId}/pending-approvals`),
  refetchInterval: 10000, // Refresh every 10s
});

// Approve call
const approveMutation = useMutation({
  mutationFn: (jobId: string) => api.post(`/api/approvals/${jobId}/approve`),
  onSuccess: () => {
    queryClient.invalidateQueries(['pending-approvals']);
  },
});

// Reject call
const rejectMutation = useMutation({
  mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
    api.post(`/api/approvals/${jobId}/reject`, { reason }),
  onSuccess: () => {
    queryClient.invalidateQueries(['pending-approvals']);
  },
});

// Create template
const createTemplateMutation = useMutation({
  mutationFn: (data: CreateTemplateDto) => api.post('/api/templates', data),
  onSuccess: () => {
    queryClient.invalidateQueries(['templates']);
    navigate('/templates');
  },
});

// Activate/Deactivate template
const toggleTemplateMutation = useMutation({
  mutationFn: ({
    templateId,
    active,
  }: {
    templateId: string;
    active: boolean;
  }) =>
    api.post(
      `/api/templates/${templateId}/${active ? 'activate' : 'deactivate'}`,
    ),
  onSuccess: () => {
    queryClient.invalidateQueries(['templates']);
  },
});
```

---

## ✅ Completion Criteria (Template-Based System)

El refactor está completo cuando:

- ✅ `apps/kol-system/` deployado en dev/staging/prod
- ✅ **Template BC funcional** — CRUD templates vía API + UI
- ✅ **Template orchestrator running** — Cron every 1 min, process all active templates
- ✅ **Multi-bot publishing works** — N templates → N bots simultáneos
- ✅ **Ranking strategies work** — Score-desc, engagement, recency, weighted
- ✅ **Manual approval flow** — UI can approve/reject pending jobs
- ✅ **Auto-approval works** — Hybrid mode auto-approves high scores
- ✅ Pipeline completo funciona end-to-end (ingestion → publishing → tracking)
- ✅ Backend NO tiene código KOL (`kol/`, `telegram/ingestion/kol/`, `telegram/vip-calls/` eliminados)
- ✅ `ingestion-telegram` sirve KOL data SOLO a `kol-system` (backend no consume)
- ✅ Tests E2E green (200+ tests, >80% coverage)
- ✅ **Frontend dashboard live** — Template management + rankings + approvals
- ✅ Docs actualizados (AGENTS.md, deployment guides, API docs)
- ✅ Monitoring dashboard (Grafana + Prometheus) — per-template metrics

---

## 🎉 Resumen: Sistema Robusto Template-Based

### Lo que hace este sistema DIFERENTE (y robusto):

1. **Configuración dinámica** — Crear/editar templates SIN redeploy de código
2. **Multi-channel por diseño** — N templates = N canales independientes con diferentes reglas
3. **A/B testing nativo** — Comparar scoring strategies en paralelo
4. **UI-first** — Dashboard completo para curation, no solo APIs
5. **Rate limiting per-template** — Protección contra spam
6. **Monitoring per-template** — Detect low publish rates, high reject rates
7. **Escalable** — Agregar un canal = crear template, no tocar código
8. **SaaS-ready** — 1 template = 1 customer (multi-tenant architecture)

### Casos de uso habilitados:

```
Use Case 1: Múltiples productos
- VIP Calls Alpha: Premium channel, manual curation
- Community Signals: Free channel, auto-publish
- Experimental Lab: Testing new strategies

Use Case 2: Segmentación
- Conservative: Score 60-70, low risk
- Balanced: Score 70-80, medium risk
- Aggressive: Score 80+, high risk

Use Case 3: A/B Testing
- Template A: Current scoring v1
- Template B: New scoring v2
→ Compare publish rate + tracking metrics

Use Case 4: Multi-Customer SaaS
- Customer 1: Template con sus KOLs + su bot
- Customer 2: Template con sus KOLs + su bot
→ Aislamiento completo
```

### Duración estimada: **9-10 semanas**

- Fases 1-7: Pipeline base (6 semanas)
- **Fase 8: Templates BC** ⭐ (1 semana, CORE)
- Fases 9-11: Approval + Publishing + Tracking (2 semanas)

**Phase 8 es el corazón del sistema robusto** — sin templates, vuelves al diseño rígido.

---

## 📚 Próximos Pasos

1. **Crear estructura de directorios** — `apps/kol-system/src/{ingestion,extraction,parsing,...}/`
2. **Implementar Phase 1** — App setup + shared module + healthcheck
3. **Crear migration script** — `scripts/migrate-kol-to-system.sh` (automated file moves)
4. **Actualizar CI/CD** — Agregar `kol-system` a `.github/workflows/deploy.yml`
5. **Escribir tests** — Coverage >80% por BC antes de producción

---

## 🔍 Referencias

- [Refactor Content Publisher](../refactor-content-publisher/11-refactor.md) — Patrón de referencia para arquitectura
- [AGENTS.md](../../AGENTS.md) — Context sobre pipeline actual
- [Backend AGENTS.md](../../apps/backend/AGENTS.md) — Detalles de implementación actual
- [Ingestion-telegram AGENTS.md](../../apps/ingestion-telegram/AGENTS.md) — API endpoints disponibles

---

**Versión**: 2.0 (Robust Template-Based Design)  
**Autor**: AI Assistant + User Requirements  
**Fecha**: 2026-09-24  
**Estado**: Ready for Implementation — Production-Grade Architecture  
**Duración estimada**: 9-10 semanas  
**Complejidad**: Alta (pero justificada para escala futura)
