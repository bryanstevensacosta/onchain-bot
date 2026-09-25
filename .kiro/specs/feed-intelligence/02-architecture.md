# Arquitectura Detallada: feed-intelligence

**Documento**: 02-architecture.md  
**Fecha**: 2026-09-25  
**Versión**: 2.0 (Template-Driven)

## 📐 Estructura del Servicio

### Tree Completo

```
apps/feed-intelligence/
├── src/
│   ├── main.ts                                    # Bootstrap NestJS :4002
│   ├── app.module.ts                              # Root module (5 BCs + template management)
│   ├── shared/
│   │   ├── kernel/                                # DDD base classes
│   │   │   ├── aggregate-root.ts
│   │   │   ├── entity.ts
│   │   │   ├── value-object.ts
│   │   │   └── domain-event.ts
│   │   ├── common/
│   │   │   ├── config/app.config.ts               # Env validation
│   │   │   ├── database/database.module.ts        # TypeORM setup (alpha_meta_token_scanner_intelligence)
│   │   │   └── persistence/entities.ts            # Entity registry
│   │   └── clients/
│   │       ├── ingestion-client.module.ts         # HTTP client to ingestion-telegram
│   │       ├── ingestion-client.service.ts        # GET /api/feed/messages (crypto-news ONLY)
│   │       └── llm-gateway-client.service.ts      # POST llm-gateway:4001/embeddings/embed
│   ├── classification/                            # BC 1: Classification
│   ├── clustering/                                # BC 2: Clustering + Synthesis
│   │   └── application/
│   │       └── services/
│   │           ├── clustering-orchestrator.service.ts
│   │           └── cluster-synthesis.service.ts   # NEW: LLM merge duplicates
│   ├── ranking/                                   # BC 3: Ranking
│   ├── aggregation/                               # BC 4: Aggregation (renamed from "aggregation")
│   │   └── application/
│   │       └── services/
│   │           ├── content-generator.service.ts   # Generates from templates
│   │           └── template-renderer.service.ts   # Renders content
│   ├── template/                                  # BC 5: Template Management (NEW)
│   │   ├── domain/
│   │   │   ├── entities/content-template.entity.ts
│   │   │   └── value-objects/template-type.vo.ts  # HIGHLIGHTS|DIGEST|BREAKING|NARRATIVE
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   │   ├── create-template.use-case.ts
│   │   │   │   ├── update-template.use-case.ts
│   │   │   │   └── delete-template.use-case.ts
│   │   │   └── services/
│   │   │       └── narrative-tracker.service.ts    # Story tracking
│   │   └── api/
│   │       └── http/template.controller.ts         # CRUD templates
│   ├── content/                                   # NEW: Generated Content API
│   │   ├── domain/entities/generated-content.entity.ts
│   │   ├── application/
│   │   │   └── use-cases/
│   │   │       ├── poll-pending-content.use-case.ts
│   │   │       └── mark-consumed.use-case.ts
│   │   └── api/http/content.controller.ts         # /content/pending (content-publisher consumer)
│   ├── story/                                     # NEW: Story Tracking (BC 5 sub-module)
│   │   ├── domain/entities/news-story.entity.ts
│   │   └── application/
│   │       └── services/
│   │           ├── story-detection.service.ts
│   │           └── story-synthesis.service.ts
│   ├── health/
│   └── metrics/
├── test/
├── config/
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 🎯 Bounded Context 1: Classification

### Dominio

**Entidades**:

```typescript
// domain/entities/classified-news.entity.ts
export class ClassifiedNews extends AggregateRoot<string> {
  public readonly channelId: string;
  public readonly messageId: number;
  public category: NewsCategory;
  public confidence: number;
  public subcategories: string[];
  public reasoning?: string;
  public classifiedAt: Date;
  public occurredAt: Date;

  static create(props: { ... }): ClassifiedNews { ... }

  public reclassify(newCategory: NewsCategory, confidence: number): void {
    this.category = newCategory;
    this.confidence = confidence;
    this.addDomainEvent(new NewsReclassifiedEvent({ ... }));
  }
}
```

**Value Objects**:

```typescript
// domain/value-objects/news-category.vo.ts
export enum NewsCategory {
  // Market Events
  LISTING = 'listing',
  AIRDROP = 'airdrop',
  IDO_ICO = 'ido_ico',

  // Business
  PARTNERSHIP = 'partnership',
  FUNDING = 'funding',
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
  subcategories: string[];
  reasoning?: string;
}
```

**Ports**:

```typescript
// domain/ports/news-classifier.port.ts
export abstract class NewsClassifierPort {
  abstract classify(input: {
    content: string;
    channelId: string;
  }): Promise<NewsClassificationResult>;
}
```

### Aplicación

**Use Cases**:

```typescript
// application/use-cases/classify-news-message.use-case.ts
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
    // 1. Rule-based first
    const ruleResult = await this.ruleBasedClassifier.classify({
      content: input.content,
      channelId: input.channelId,
    });

    // 2. Skip LLM if high confidence
    if (ruleResult.confidence >= 0.85) {
      await this.persist(input, ruleResult);
      return ruleResult;
    }

    // 3. LLM fallback (optional)
    if (this.config.useLlmClassifier) {
      const llmResult = await this.llmClassifier.classify({
        content: input.content,
        ruleBasedHint: ruleResult.category,
      });

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

### Infraestructura

**Adapters**:

```typescript
// infrastructure/adapters/rule-based-classifier.adapter.ts
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
    // ... resto de categorías
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

**Persistence**:

```typescript
// infrastructure/persistence/typeorm/entities/classified-news.entity.ts
@Entity('classified_news')
export class ClassifiedNewsOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  channelId: string;

  @Column({ type: 'integer' })
  messageId: number;

  @Column({ type: 'varchar', length: 32 })
  category: string;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ type: 'text', array: true, default: [] })
  subcategories: string[];

  @Column({ type: 'text', nullable: true })
  reasoning?: string;

  @CreateDateColumn()
  classifiedAt: Date;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @Index()
  @Unique(['channelId', 'messageId'])
  compositeKey: void;
}
```

**Scheduler**:

```typescript
// infrastructure/scheduling/classification-cron.scheduler.ts
@Injectable()
export class ClassificationCronScheduler {
  @Cron(CronExpression.EVERY_30_SECONDS)
  async batchClassify(): Promise<void> {
    if (!this.config.classificationEnabled) return;

    const unclassified = await this.fetchUnclassified();

    for (const msg of unclassified) {
      await this.classifyUseCase.execute({
        channelId: msg.channelId,
        messageId: msg.messageId,
        content: msg.content,
        occurredAt: msg.publishedAt,
      });
    }
  }

  private async fetchUnclassified(): Promise<CryptoNewsMessageDto[]> {
    // Fetch from ingestion-telegram, filter out already classified
    const recent = await this.ingestionClient.fetchRecentMessages(100);
    const classified = await this.classificationRepo.findByMessageIds(
      recent.map((m) => ({ channelId: m.channelId, messageId: m.messageId })),
    );

    const classifiedKeys = new Set(
      classified.map((c) => `${c.channelId}:${c.messageId}`),
    );

    return recent.filter(
      (m) => !classifiedKeys.has(`${m.channelId}:${m.messageId}`),
    );
  }
}
```

### API

```typescript
// api/http/classification.controller.ts
@Controller('classification')
export class ClassificationController {
  @Get('stats')
  async getCategoryStats(
    @Query('windowHours', new DefaultValuePipe(24), ParseIntPipe)
    windowHours: number,
  ): Promise<CategoryStatsDto[]> {
    return this.getCategoryStatsUseCase.execute({ windowHours });
  }

  @Post('classify')
  @HttpCode(200)
  async manualClassify(
    @Body() body: ManualClassifyDto,
  ): Promise<NewsClassificationResult> {
    return this.classifyUseCase.execute({
      channelId: body.channelId,
      messageId: body.messageId,
      content: body.content,
      occurredAt: body.occurredAt,
    });
  }
}
```

## 🔗 Bounded Context 2: Clustering + Synthesis

### Dominio

```typescript
// domain/entities/news-cluster.entity.ts
export class NewsCluster extends AggregateRoot<string> {
  public readonly id: string;
  public representativeMessage: {
    channelId: string;
    messageId: number;
  };
  public members: Array<{
    channelId: string;
    messageId: number;
  }>;
  public size: number;
  public synthesized: boolean;  // NEW
  public createdAt: Date;
  public expiresAt: Date;  // 48h TTL

  static create(props: { ... }): NewsCluster { ... }

  public addMember(channelId: string, messageId: number): void {
    this.members.push({ channelId, messageId });
    this.size = this.members.length;
  }

  public markSynthesized(): void {  // NEW
    this.synthesized = true;
    this.addDomainEvent(new ClusterSynthesizedEvent({ clusterId: this.id }));
  }

  public isExpired(): boolean {
    return new Date() > this.expiresAt;
  }
}

// domain/entities/cluster-synthesis.entity.ts (NEW)
export class ClusterSynthesis extends AggregateRoot<string> {
  public readonly id: string;
  public readonly clusterId: string;
  public synthesizedContent: string;
  public sourceMessages: Array<{
    channelId: string;
    messageId: number;
  }>;
  public synthesizedAt: Date;

  static create(props: {
    clusterId: string;
    synthesizedContent: string;
    sourceMessages: Array<{ channelId: string; messageId: number }>;
  }): ClusterSynthesis {
    const synthesis = new ClusterSynthesis();
    synthesis.id = uuidv4();
    synthesis.clusterId = props.clusterId;
    synthesis.synthesizedContent = props.synthesizedContent;
    synthesis.sourceMessages = props.sourceMessages;
    synthesis.synthesizedAt = new Date();
    return synthesis;
  }
}
```

### Aplicación

```typescript
// application/services/clustering-orchestrator.service.ts
@Injectable()
export class ClusteringOrchestratorService {
  constructor(
    private readonly llmGatewayClient: LlmGatewayClientService,
    private readonly clusterRepo: NewsClusterRepository,
    private readonly ingestionClient: CryptoNewsIngestionClient,
    private readonly synthesisService: ClusterSynthesisService, // NEW
  ) {}

  async clusterRecentMessages(windowHours = 24): Promise<NewsCluster[]> {
    const messages = await this.ingestionClient.fetchRecentMessages(500);
    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
    const recent = messages.filter((m) => new Date(m.ingestedAt) >= cutoff);

    const clusters = new Map<string, CryptoNewsMessageDto[]>();

    for (const msg of recent) {
      let foundCluster = false;

      for (const [clusterId, members] of clusters.entries()) {
        const representative = members[0];
        const similarity = await this.computeSimilarity(
          msg.content,
          representative.content,
        );

        if (similarity >= 0.7) {
          members.push(msg);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        const clusterId = `cluster-${msg.channelId}-${msg.messageId}`;
        clusters.set(clusterId, [msg]);
      }
    }

    const results: NewsCluster[] = [];
    for (const [clusterId, members] of clusters.entries()) {
      if (members.length >= 2) {
        const cluster = NewsCluster.create({
          id: clusterId,
          representativeMessage: {
            channelId: members[0].channelId,
            messageId: members[0].messageId,
          },
          members: members.map((m) => ({
            channelId: m.channelId,
            messageId: m.messageId,
          })),
          size: members.length,
          synthesized: false, // NEW
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        });

        await this.clusterRepo.save(cluster);
        results.push(cluster);

        // NEW: Trigger synthesis if enabled
        if (this.config.clusterSynthesisEnabled) {
          await this.synthesisService.synthesizeCluster(cluster, members);
        }
      }
    }

    return results;
  }

  private async computeSimilarity(
    textA: string,
    textB: string,
  ): Promise<number> {
    const response = await this.llmGatewayClient.computeSimilarity({
      textA,
      textB,
    });
    return response.similarity;
  }
}

// application/services/cluster-synthesis.service.ts (NEW)
@Injectable()
export class ClusterSynthesisService {
  constructor(
    private readonly llmGatewayClient: LlmGatewayClientService,
    private readonly synthesisRepo: ClusterSynthesisRepository,
    private readonly clusterRepo: NewsClusterRepository,
  ) {}

  /**
   * Merge duplicate news into single synthesized version with LLM
   */
  async synthesizeCluster(
    cluster: NewsCluster,
    messages: CryptoNewsMessageDto[],
  ): Promise<ClusterSynthesis> {
    // 1. Call LLM to merge all similar messages
    const prompt = this.buildSynthesisPrompt(messages);
    const response = await this.llmGatewayClient.chat({
      messages: [
        {
          role: 'system',
          content:
            'You are a crypto news editor. Merge duplicate news into one comprehensive article.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const synthesizedContent = response.choices[0].message.content;

    // 2. Save synthesis
    const synthesis = ClusterSynthesis.create({
      clusterId: cluster.id,
      synthesizedContent,
      sourceMessages: messages.map((m) => ({
        channelId: m.channelId,
        messageId: m.messageId,
      })),
    });

    await this.synthesisRepo.save(synthesis);

    // 3. Mark cluster as synthesized
    cluster.markSynthesized();
    await this.clusterRepo.save(cluster);

    return synthesis;
  }

  private buildSynthesisPrompt(messages: CryptoNewsMessageDto[]): string {
    const numbered = messages
      .map(
        (m, idx) =>
          `[${idx + 1}] ${m.content} (source: ${m.channelId}, published: ${m.publishedAt})`,
      )
      .join('\n\n');

    return `
You have ${messages.length} similar crypto news articles about the same event. Merge them into ONE comprehensive article that:
1. Combines all unique information from each source
2. Removes redundancy
3. Maintains factual accuracy
4. Preserves important details (numbers, dates, names)
5. Is concise but complete (max 300 words)

Articles to merge:
${numbered}

Output ONLY the merged article text, no preamble.
`.trim();
  }

  /**
   * Apply synthesis to ranked news feed (replaces cluster members with synthesized version)
   */
  async applySynthesis(
    rankedNews: RankedNewsItem[],
    options: { minClusterSize: number },
  ): Promise<RankedNewsItem[]> {
    // 1. Load all synthesized clusters
    const allSynthesis = await this.synthesisRepo.findRecent(48);
    const synthesisMap = new Map(allSynthesis.map((s) => [s.clusterId, s]));

    // 2. Build lookup of which messages belong to which cluster
    const clusters = await this.clusterRepo.findByWindow(48);
    const messageToCluster = new Map<string, NewsCluster>();
    for (const cluster of clusters) {
      if (cluster.size < options.minClusterSize) continue;
      for (const member of cluster.members) {
        messageToCluster.set(
          `${member.channelId}:${member.messageId}`,
          cluster,
        );
      }
    }

    // 3. Replace cluster members with synthesized version
    const seen = new Set<string>();
    const result: RankedNewsItem[] = [];

    for (const item of rankedNews) {
      const key = `${item.message.channelId}:${item.message.messageId}`;
      const cluster = messageToCluster.get(key);

      if (cluster && synthesisMap.has(cluster.id)) {
        // Skip if we've already added this cluster's synthesis
        if (seen.has(cluster.id)) continue;
        seen.add(cluster.id);

        // Use synthesized content instead
        const synthesis = synthesisMap.get(cluster.id)!;
        result.push({
          ...item,
          message: {
            ...item.message,
            content: synthesis.synthesizedContent,
          },
          synthesized: true,
          clusterSize: cluster.size,
        });
      } else {
        // Not part of a cluster, keep original
        result.push(item);
      }
    }

    return result;
  }
}
```

**Scheduler**:

```typescript
// infrastructure/scheduling/clustering-cron.scheduler.ts
@Injectable()
export class ClusteringCronScheduler {
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    if (!this.config.clusteringEnabled) return;

    try {
      const clusters = await this.orchestrator.clusterRecentMessages(24);
      this.logger.log(`Clustered ${clusters.length} groups`);
    } catch (error) {
      this.logger.error('Clustering failed', error);
    }
  }
}
```

## 📈 Bounded Context 3: Ranking

### Aplicación

**Scoring Formula**:

```typescript
// application/services/scoring-formula.service.ts
@Injectable()
export class ScoringFormulaService {
  /**
   * Score = ageScore(30%) + engagement(25%) + source(20%) + category(15%) + uniqueness(10%)
   */
  computeRelevanceScore(input: {
    message: CryptoNewsMessageDto;
    classification: NewsClassificationResult;
    clusterSize: number;
    sourceReputation: number;
    hoursSincePublished: number;
  }): number {
    // 1. Temporal decay (exponential)
    const ageScore = Math.exp(-input.hoursSincePublished / 12) * 30;

    // 2. Engagement potential
    const hasMedia = input.message.media.length > 0;
    const contentLength = input.message.content.length;
    const engagementScore =
      (hasMedia ? 15 : 0) +
      (contentLength > 200 && contentLength < 1000 ? 10 : 0);

    // 3. Source quality
    const sourceScore = input.sourceReputation * 20;

    // 4. Category boost
    const highValueCategories = new Set([
      NewsCategory.LISTING,
      NewsCategory.HACK_EXPLOIT,
      NewsCategory.FUNDING,
      NewsCategory.PARTNERSHIP,
    ]);
    const categoryBoost = highValueCategories.has(input.classification.category)
      ? 15 * input.classification.confidence
      : 5;

    // 5. Uniqueness (penalty for large clusters)
    const uniquenessScore =
      input.clusterSize === 1
        ? 10
        : Math.max(0, 10 - (input.clusterSize - 1) * 2);

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

**Use Case**:

```typescript
// application/use-cases/rank-news-feed.use-case.ts
@Injectable()
export class RankNewsFeedUseCase {
  async execute(query: {
    limit?: number;
    category?: NewsCategory;
    minScore?: number;
  }): Promise<RankedNewsItem[]> {
    // 1. Fetch RAW messages
    const messages = await this.ingestionClient.fetchRecentMessages(
      query.limit || 100,
    );

    // 2. Load classifications + clusters
    const [classifications, clusters] = await Promise.all([
      this.classificationRepo.findByMessageIds(
        messages.map((m) => ({
          channelId: m.channelId,
          messageId: m.messageId,
        })),
      ),
      this.clusterRepo.findByWindow(24),
    ]);

    // 3. Build lookup maps
    const classMap = new Map(
      classifications.map((c) => [`${c.channelId}:${c.messageId}`, c]),
    );
    const clusterMap = this.buildClusterLookup(clusters);

    // 4. Score each message
    const scored = [];
    for (const msg of messages) {
      const key = `${msg.channelId}:${msg.messageId}`;
      const classification = classMap.get(key);
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

    // 5. Sort + return
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, query.limit || 50).map((item, index) => ({
      ...item.message,
      rank: index + 1,
      relevanceScore: item.score,
      classification: classMap.get(
        `${item.message.channelId}:${item.message.messageId}`,
      )!,
    }));
  }
}
```

## 📰 Bounded Context 4: Content Generation

> **v2.0 Note**: BC4 was renamed from "Aggregation" to "Content Generation" and now operates based on **templates from BC5** instead of hardcoded schedulers.

### Dominio

```typescript
// domain/entities/generated-content.entity.ts
export class GeneratedContent extends AggregateRoot<string> {
  public readonly id: string;
  public readonly templateId: string;
  public readonly templateName: string;
  public readonly templateType: TemplateType;
  public content: string;
  public metadata: ContentMetadata;
  public generatedAt: Date;
  public consumed: boolean;
  public consumedAt?: Date;

  static create(props: {
    templateId: string;
    templateName: string;
    templateType: TemplateType;
    content: string;
    metadata: ContentMetadata;
  }): GeneratedContent {
    const entity = new GeneratedContent();
    entity.id = uuidv4();
    entity.templateId = props.templateId;
    entity.templateName = props.templateName;
    entity.templateType = props.templateType;
    entity.content = props.content;
    entity.metadata = props.metadata;
    entity.generatedAt = new Date();
    entity.consumed = false;
    return entity;
  }

  public markConsumed(): void {
    if (this.consumed) {
      throw new Error('Content already consumed');
    }
    this.consumed = true;
    this.consumedAt = new Date();
    this.addDomainEvent(new ContentConsumedEvent({ contentId: this.id }));
  }
}

export interface ContentMetadata {
  totalItems: number;
  avgScore: number;
  categoriesIncluded: NewsCategory[];
  sourcesIncluded: string[];
  timeWindowStart: Date;
  timeWindowEnd: Date;
}
```

### Aplicación

**Template Renderers** (one per template type):

```typescript
// application/services/template-renderer.service.ts
@Injectable()
export class TemplateRendererService {
  private renderHighlights(
    news: RankedNewsItem[],
    config: TemplateConfig,
  ): string {
    const limit = config.content.limit || 5;
    const top = news.slice(0, limit);

    const header = `📰 **Top ${limit} Crypto News**\n\n`;
    const entries = top
      .map((item, idx) => {
        const emoji = this.getCategoryEmoji(item.classification.category);
        const content = item.synthesized
          ? item.message.content
          : item.message.content.substring(0, 150) + '...';
        return `${emoji} **${idx + 1}.** ${content}`;
      })
      .join('\n\n');

    const footer = `\n\n_Score range: ${Math.round(top[0].relevanceScore)}-${Math.round(top[top.length - 1].relevanceScore)}_`;

    return header + entries + footer;
  }

  private renderDigest(news: RankedNewsItem[], config: TemplateConfig): string {
    const byCategory = this.groupByCategory(news);

    let content = '📊 **Crypto News Digest**\n\n';

    for (const [category, items] of byCategory.entries()) {
      const emoji = this.getCategoryEmoji(category);
      content += `${emoji} **${category.toUpperCase()}** (${items.length})\n`;

      for (const item of items.slice(0, 3)) {
        const text = item.synthesized
          ? item.message.content.substring(0, 100)
          : item.message.content.substring(0, 100);
        content += `  • ${text}...\n`;
      }

      content += '\n';
    }

    return content;
  }

  private renderBreaking(
    news: RankedNewsItem[],
    config: TemplateConfig,
  ): string {
    const breaking = news.filter((n) => n.relevanceScore >= 85);

    if (breaking.length === 0) {
      return ''; // No breaking news
    }

    let content = '🚨 **BREAKING CRYPTO NEWS**\n\n';

    for (const item of breaking) {
      const emoji = this.getCategoryEmoji(item.classification.category);
      content += `${emoji} ${item.message.content}\n\n`;
    }

    return content;
  }

  private renderNarrative(
    news: RankedNewsItem[],
    config: TemplateConfig,
  ): string {
    // Filter news with story context
    const stories = news.filter((n) => n.storyContext);

    if (stories.length === 0) {
      return '';
    }

    let content = '📖 **Developing Stories**\n\n';

    for (const item of stories) {
      const ctx = item.storyContext!;
      const emoji = this.getCategoryEmoji(item.classification.category);

      content += `${emoji} **${ctx.title}**\n`;
      content += `Updates: ${ctx.updateCount} | Latest: ${this.formatDate(item.message.publishedAt)}\n`;
      content += `${item.message.content}\n\n`;

      if (ctx.updateCount > 1) {
        content += `_Timeline: ${ctx.timeline.map((t) => t.type).join(' → ')}_\n\n`;
      }
    }

    return content;
  }

  private getCategoryEmoji(category: NewsCategory): string {
    const emojiMap: Record<NewsCategory, string> = {
      [NewsCategory.LISTING]: '🚀',
      [NewsCategory.HACK_EXPLOIT]: '🚨',
      [NewsCategory.AIRDROP]: '🎁',
      [NewsCategory.PARTNERSHIP]: '🤝',
      [NewsCategory.FUNDING]: '💰',
      [NewsCategory.WHALE_ACTIVITY]: '🐋',
      [NewsCategory.REGULATION]: '⚖️',
      // ...
    };
    return emojiMap[category] || '📌';
  }
}
```

**Scheduled Generation** (dynamic cron from templates):

```typescript
// infrastructure/scheduling/template-generation.scheduler.ts
@Injectable()
export class TemplateGenerationScheduler implements OnModuleInit {
  private cronJobs: Map<string, ScheduledTask> = new Map();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly templateRepo: ContentTemplateRepository,
    private readonly contentGeneratorService: ContentGeneratorService,
  ) {}

  async onModuleInit() {
    // Load all templates with cron schedules
    const templates = await this.templateRepo.findAll();

    for (const template of templates) {
      if (template.enabled && template.config.schedule.cron) {
        this.registerCronJob(template);
      }
    }
  }

  private registerCronJob(template: ContentTemplate): void {
    const job = new CronJob(template.config.schedule.cron!, async () => {
      try {
        await this.contentGeneratorService.generateForTemplate(template.id);
        this.logger.log(`Generated content for template: ${template.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to generate for template ${template.name}`,
          error,
        );
      }
    });

    this.schedulerRegistry.addCronJob(template.id, job);
    job.start();

    this.cronJobs.set(template.id, job);
    this.logger.log(
      `Registered cron job for template: ${template.name} (${template.config.schedule.cron})`,
    );
  }

  /**
   * Update cron job when template config changes
   */
  async updateTemplateSchedule(templateId: string): Promise<void> {
    // Remove old job
    if (this.cronJobs.has(templateId)) {
      const oldJob = this.cronJobs.get(templateId)!;
      oldJob.stop();
      this.schedulerRegistry.deleteCronJob(templateId);
      this.cronJobs.delete(templateId);
    }

    // Register new job
    const template = await this.templateRepo.findById(templateId);
    if (template && template.enabled && template.config.schedule.cron) {
      this.registerCronJob(template);
    }
  }
}
```

## 📋 Bounded Context 5: Template Management (NEW v2.0)

### Dominio

**Entidades**:

```typescript
// template/domain/entities/content-template.entity.ts
export class ContentTemplate extends AggregateRoot<string> {
  public readonly id: string;
  public name: string;
  public type: TemplateType;
  public enabled: boolean;
  public config: TemplateConfig;
  public createdAt: Date;
  public updatedAt: Date;

  static create(props: {
    name: string;
    type: TemplateType;
    config: TemplateConfig;
  }): ContentTemplate {
    const template = new ContentTemplate();
    template.id = uuidv4();
    template.name = props.name;
    template.type = props.type;
    template.enabled = true;
    template.config = props.config;
    template.createdAt = new Date();
    template.updatedAt = new Date();
    return template;
  }

  public updateConfig(newConfig: Partial<TemplateConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.updatedAt = new Date();
    this.addDomainEvent(
      new TemplateConfigUpdatedEvent({ templateId: this.id }),
    );
  }

  public toggleEnabled(): void {
    this.enabled = !this.enabled;
    this.updatedAt = new Date();
  }
}
```

**Value Objects**:

```typescript
// template/domain/value-objects/template-type.vo.ts
export enum TemplateType {
  HIGHLIGHTS = 'highlights', // Top N más relevantes
  DIGEST = 'digest', // Agrupado por categoría
  BREAKING = 'breaking', // Solo score >= 85
  NARRATIVE = 'narrative', // Storytelling con historia
}

export interface TemplateConfig {
  // Scheduling
  schedule: {
    cron?: string; // Ej: "0 * * * *" (hourly)
    manual?: boolean; // Require manual trigger
  };

  // Filtering
  filters: {
    minScore?: number; // 0-100
    categories?: NewsCategory[];
    excludeCategories?: NewsCategory[];
    maxAgeHours?: number; // Ventana temporal
  };

  // Content
  content: {
    limit?: number; // Max items to include
    groupByCategory?: boolean; // For DIGEST type
    includeSummary?: boolean; // LLM synthesis
  };

  // Scoring weights (BC 3)
  scoring?: {
    ageWeight: number; // Default 0.30
    engagementWeight: number; // Default 0.25
    sourceWeight: number; // Default 0.20
    categoryWeight: number; // Default 0.15
    uniquenessWeight: number; // Default 0.10
  };

  // Narrative-specific (BC 5.2)
  narrative?: {
    storyTrackingEnabled: boolean;
    minUpdatesForNarrative: number; // Default 2
    synthesizeHistory: boolean; // Combine all updates
  };

  // Cluster synthesis (BC 2)
  clustering?: {
    synthesisEnabled: boolean; // Merge duplicates with LLM
    minClusterSize: number; // Default 2
  };
}
```

### Aplicación

**Use Cases**:

```typescript
// template/application/use-cases/create-template.use-case.ts
@Injectable()
export class CreateTemplateUseCase {
  constructor(private readonly templateRepo: ContentTemplateRepository) {}

  async execute(input: {
    name: string;
    type: TemplateType;
    config: TemplateConfig;
  }): Promise<ContentTemplate> {
    // Validate config for template type
    this.validateConfig(input.type, input.config);

    const template = ContentTemplate.create(input);
    await this.templateRepo.save(template);

    return template;
  }

  private validateConfig(type: TemplateType, config: TemplateConfig): void {
    if (type === TemplateType.BREAKING && !config.filters.minScore) {
      throw new Error('BREAKING template requires minScore');
    }

    if (
      type === TemplateType.NARRATIVE &&
      !config.narrative?.storyTrackingEnabled
    ) {
      throw new Error('NARRATIVE template requires storyTrackingEnabled');
    }

    // ...more validations
  }
}

// template/application/use-cases/update-template.use-case.ts
@Injectable()
export class UpdateTemplateUseCase {
  async execute(input: {
    templateId: string;
    updates: Partial<{
      name: string;
      config: TemplateConfig;
      enabled: boolean;
    }>;
  }): Promise<ContentTemplate> {
    const template = await this.templateRepo.findById(input.templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (input.updates.name) template.name = input.updates.name;
    if (input.updates.config) template.updateConfig(input.updates.config);
    if (input.updates.enabled !== undefined) {
      if (input.updates.enabled !== template.enabled) {
        template.toggleEnabled();
      }
    }

    await this.templateRepo.save(template);
    return template;
  }
}
```

**Content Generator** (links BC4 + BC5):

```typescript
// aggregation/application/services/content-generator.service.ts
@Injectable()
export class ContentGeneratorService {
  constructor(
    private readonly templateRepo: ContentTemplateRepository,
    private readonly rankingUseCase: RankNewsFeedUseCase,
    private readonly synthesisService: ClusterSynthesisService,
    private readonly storyService: NarrativeTrackerService,
    private readonly generatedContentRepo: GeneratedContentRepository,
  ) {}

  async generateForTemplate(templateId: string): Promise<GeneratedContent> {
    const template = await this.templateRepo.findById(templateId);
    if (!template || !template.enabled) {
      throw new Error('Template not found or disabled');
    }

    // 1. Fetch + rank news according to template config
    const rankedNews = await this.rankingUseCase.execute({
      limit: template.config.content.limit || 50,
      minScore: template.config.filters.minScore,
      category: template.config.filters.categories?.[0],
    });

    // 2. Apply clustering synthesis if enabled
    let finalNews = rankedNews;
    if (template.config.clustering?.synthesisEnabled) {
      finalNews = await this.synthesisService.applySynthesis(rankedNews, {
        minClusterSize: template.config.clustering.minClusterSize || 2,
      });
    }

    // 3. Story tracking for NARRATIVE type
    if (template.type === TemplateType.NARRATIVE) {
      const stories = await this.storyService.detectStories(finalNews);
      finalNews = this.storyService.enrichWithStoryContext(finalNews, stories);
    }

    // 4. Render content
    const content = this.renderContent(template, finalNews);

    // 5. Save to DB
    const generatedContent = GeneratedContent.create({
      templateId: template.id,
      templateName: template.name,
      templateType: template.type,
      content,
      metadata: {
        totalItems: finalNews.length,
        avgScore: this.computeAvgScore(finalNews),
        generatedAt: new Date(),
      },
      consumed: false,
    });

    await this.generatedContentRepo.save(generatedContent);
    return generatedContent;
  }

  private renderContent(
    template: ContentTemplate,
    news: RankedNewsItem[],
  ): string {
    switch (template.type) {
      case TemplateType.HIGHLIGHTS:
        return this.renderHighlights(news, template.config);
      case TemplateType.DIGEST:
        return this.renderDigest(news, template.config);
      case TemplateType.BREAKING:
        return this.renderBreaking(news, template.config);
      case TemplateType.NARRATIVE:
        return this.renderNarrative(news, template.config);
      default:
        throw new Error(`Unknown template type: ${template.type}`);
    }
  }

  // ...render methods
}
```

**Story Tracking Service**:

```typescript
// template/application/services/narrative-tracker.service.ts
@Injectable()
export class NarrativeTrackerService {
  constructor(
    private readonly storyRepo: NewsStoryRepository,
    private readonly llmGatewayClient: LlmGatewayClientService,
  ) {}

  /**
   * Detect if news items are updates to existing stories
   */
  async detectStories(news: RankedNewsItem[]): Promise<NewsStory[]> {
    const stories: NewsStory[] = [];

    for (const item of news) {
      // 1. Generate embedding for this news
      const embedding = await this.llmGatewayClient.generateEmbedding({
        text: item.message.content,
      });

      // 2. Search for similar existing stories
      const similarStories = await this.storyRepo.findSimilar({
        embedding,
        threshold: 0.75, // High threshold for story matching
        limit: 1,
      });

      if (similarStories.length > 0) {
        // Update existing story
        const story = similarStories[0];
        story.addUpdate({
          channelId: item.message.channelId,
          messageId: item.message.messageId,
          updateType: this.classifyUpdateType(item, story),
          occurredAt: item.message.publishedAt,
        });

        await this.storyRepo.save(story);
        stories.push(story);
      } else {
        // Create new story
        const newStory = NewsStory.create({
          title: this.extractTitle(item.message.content),
          initialMessage: {
            channelId: item.message.channelId,
            messageId: item.message.messageId,
          },
          embedding,
          category: item.classification.category,
          startedAt: item.message.publishedAt,
        });

        await this.storyRepo.save(newStory);
        stories.push(newStory);
      }
    }

    return stories;
  }

  private classifyUpdateType(
    item: RankedNewsItem,
    story: NewsStory,
  ): StoryUpdateType {
    // Simple heuristic: analyze content for keywords
    const content = item.message.content.toLowerCase();

    if (content.includes('update:') || content.includes('breaking:')) {
      return StoryUpdateType.DEVELOPMENT;
    }
    if (content.includes('correction:') || content.includes('clarification:')) {
      return StoryUpdateType.CORRECTION;
    }
    if (content.includes('resolved') || content.includes('concluded')) {
      return StoryUpdateType.RESOLUTION;
    }

    return StoryUpdateType.DEVELOPMENT;
  }

  /**
   * Enrich news items with story context (for NARRATIVE template)
   */
  enrichWithStoryContext(
    news: RankedNewsItem[],
    stories: NewsStory[],
  ): RankedNewsItem[] {
    const storyMap = new Map(
      stories.map((s) => [
        `${s.initialMessage.channelId}:${s.initialMessage.messageId}`,
        s,
      ]),
    );

    return news.map((item) => {
      const key = `${item.message.channelId}:${item.message.messageId}`;
      const story = storyMap.get(key);

      if (story) {
        return {
          ...item,
          storyContext: {
            storyId: story.id,
            title: story.title,
            updateCount: story.updates.length,
            timeline: story.updates.map((u) => ({
              type: u.updateType,
              occurredAt: u.occurredAt,
            })),
          },
        };
      }

      return item;
    });
  }
}
```

### API

```typescript
// template/api/http/template.controller.ts
@Controller('templates')
export class TemplateController {
  @Get()
  async listTemplates(): Promise<ContentTemplate[]> {
    return this.templateRepo.findAll();
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string): Promise<ContentTemplate> {
    const template = await this.templateRepo.findById(id);
    if (!template) throw new NotFoundException();
    return template;
  }

  @Post()
  async createTemplate(
    @Body() dto: CreateTemplateDto,
  ): Promise<ContentTemplate> {
    return this.createTemplateUseCase.execute(dto);
  }

  @Patch(':id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<ContentTemplate> {
    return this.updateTemplateUseCase.execute({ templateId: id, updates: dto });
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteTemplate(@Param('id') id: string): Promise<void> {
    await this.deleteTemplateUseCase.execute({ templateId: id });
  }

  @Post(':id/toggle')
  async toggleTemplate(@Param('id') id: string): Promise<ContentTemplate> {
    return this.updateTemplateUseCase.execute({
      templateId: id,
      updates: { enabled: !(await this.templateRepo.findById(id))!.enabled },
    });
  }

  @Post(':id/generate')
  async generateContent(@Param('id') id: string): Promise<GeneratedContent> {
    return this.contentGeneratorService.generateForTemplate(id);
  }
}

// content/api/http/content.controller.ts (content-publisher consumer)
@Controller('content')
export class ContentController {
  @Get('pending')
  async getPendingContent(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<GeneratedContent[]> {
    return this.pollPendingContentUseCase.execute({ limit });
  }

  @Post(':id/consume')
  @HttpCode(204)
  async markConsumed(@Param('id') id: string): Promise<void> {
    await this.markConsumedUseCase.execute({ contentId: id });
  }
}
```

## 🗄️ Database Schema (v2.0)

```sql
-- BC1: Classification
CREATE TABLE classified_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(64) NOT NULL,
  message_id INTEGER NOT NULL,
  category VARCHAR(32) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  subcategories TEXT[],
  reasoning TEXT,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE(channel_id, message_id)
);

CREATE INDEX idx_classified_news_category ON classified_news(category);
CREATE INDEX idx_classified_news_occurred ON classified_news(occurred_at DESC);

-- BC2: Clustering
CREATE TABLE news_clusters (
  id VARCHAR(128) PRIMARY KEY,
  representative_channel_id VARCHAR(64) NOT NULL,
  representative_message_id INTEGER NOT NULL,
  member_count INTEGER NOT NULL,
  members JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_news_clusters_created ON news_clusters(created_at DESC);
CREATE INDEX idx_news_clusters_expires ON news_clusters(expires_at) WHERE expires_at > NOW();

-- BC2: Cluster Synthesis (NEW)
CREATE TABLE cluster_synthesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id VARCHAR(128) NOT NULL REFERENCES news_clusters(id) ON DELETE CASCADE,
  synthesized_content TEXT NOT NULL,
  source_messages JSONB NOT NULL,  -- Array of {channelId, messageId}
  synthesized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cluster_id)
);

CREATE INDEX idx_cluster_synthesis_cluster ON cluster_synthesis(cluster_id);

-- BC5: Content Templates (NEW)
CREATE TABLE content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL UNIQUE,
  type VARCHAR(32) NOT NULL CHECK (type IN ('highlights', 'digest', 'breaking', 'narrative')),
  enabled BOOLEAN DEFAULT TRUE,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_templates_type ON content_templates(type);
CREATE INDEX idx_content_templates_enabled ON content_templates(enabled) WHERE enabled = TRUE;

-- BC5: Generated Content (NEW)
CREATE TABLE generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES content_templates(id) ON DELETE CASCADE,
  template_name VARCHAR(128) NOT NULL,
  template_type VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed BOOLEAN DEFAULT FALSE,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX idx_generated_content_template ON generated_content(template_id);
CREATE INDEX idx_generated_content_pending ON generated_content(consumed, generated_at DESC) WHERE consumed = FALSE;

-- BC5: News Stories (NEW)
CREATE TABLE news_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(512) NOT NULL,
  initial_channel_id VARCHAR(64) NOT NULL,
  initial_message_id INTEGER NOT NULL,
  embedding vector(384),  -- bge-small-en-v1.5 dimension
  category VARCHAR(32) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_news_stories_category ON news_stories(category);
CREATE INDEX idx_news_stories_started ON news_stories(started_at DESC);
CREATE INDEX idx_news_stories_active ON news_stories(active) WHERE active = TRUE;

-- Vector similarity search (requires pgvector extension)
CREATE INDEX idx_news_stories_embedding ON news_stories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- BC5: Story Updates (NEW)
CREATE TABLE story_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES news_stories(id) ON DELETE CASCADE,
  channel_id VARCHAR(64) NOT NULL,
  message_id INTEGER NOT NULL,
  update_type VARCHAR(32) NOT NULL CHECK (update_type IN ('initial', 'development', 'resolution', 'correction')),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_story_updates_story ON story_updates(story_id, occurred_at DESC);
```

## ⚙️ Configuración (v2.0)

```typescript
// shared/common/config/app.config.ts
export interface IntelligenceConfig {
  // Classification (BC1)
  classificationEnabled: boolean;
  useLlmClassifier: boolean;

  // Clustering (BC2)
  clusteringEnabled: boolean;
  clusteringSimilarityThreshold: number; // 0.7
  clusteringWindowHours: number; // 24

  // Cluster Synthesis (BC2)
  clusterSynthesisEnabled: boolean; // NEW: Merge duplicates with LLM
  minClusterSizeForSynthesis: number; // Default 2

  // Ranking (BC3)
  rankingEnabled: boolean;

  // Template Management (BC5)
  templateManagementEnabled: boolean; // NEW
  defaultScoringWeights: {
    // NEW: Per-template overridable
    ageWeight: number; // 0.30
    engagementWeight: number; // 0.25
    sourceWeight: number; // 0.20
    categoryWeight: number; // 0.15
    uniquenessWeight: number; // 0.10
  };

  // Story Tracking (BC5)
  storyTrackingEnabled: boolean; // NEW
  storySimilarityThreshold: number; // 0.75 (high threshold)
  storyMaxAgeHours: number; // 72 (3 days)

  // External services
  ingestionTelegramUrl: string;
  llmGatewayUrl: string;

  // Database
  databaseHost: string;
  databaseName: string; // alpha_meta_token_scanner_intelligence
}
```

### Environment Variables

```bash
# .env
INTELLIGENCE_PORT=4002
INTELLIGENCE_DATABASE_HOST=localhost
INTELLIGENCE_DATABASE_PORT=5432
INTELLIGENCE_DATABASE_NAME=alpha_meta_token_scanner_intelligence
INTELLIGENCE_DATABASE_USER=postgres
INTELLIGENCE_DATABASE_PASSWORD=xxx

# Feature flags
INTELLIGENCE_CLASSIFICATION_ENABLED=true
INTELLIGENCE_USE_LLM_CLASSIFIER=false
INTELLIGENCE_CLUSTERING_ENABLED=true
INTELLIGENCE_CLUSTER_SYNTHESIS_ENABLED=true
INTELLIGENCE_RANKING_ENABLED=true
INTELLIGENCE_TEMPLATE_MANAGEMENT_ENABLED=true
INTELLIGENCE_STORY_TRACKING_ENABLED=true

# External services
INGESTION_TELEGRAM_URL=http://localhost:3032  # Prod on Oracle
LLM_GATEWAY_URL=http://localhost:4001

# Thresholds
CLUSTERING_SIMILARITY_THRESHOLD=0.7
STORY_SIMILARITY_THRESHOLD=0.75
```

---

**Ver documentos relacionados**:

- [01-overview.md](./01-overview.md) — Visión general y motivación
- [03-infrastructure.md](./03-infrastructure.md) — VPS, LLM Gateway, deployment
- [04-content-templates.md](./04-content-templates.md) — Templates de agregación
- [05-implementation.md](./05-implementation.md) — Roadmap y testing
