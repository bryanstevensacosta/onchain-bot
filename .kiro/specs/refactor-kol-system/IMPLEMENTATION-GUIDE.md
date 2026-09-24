# KOL System Refactor - Guía de Implementación Ejecutiva

> **Versión**: 2.0 (Template-Based)  
> **Fecha**: 2026-09-24  
> **Propósito**: Guía condensada para implementar el sistema KOL robusto sin leer 1000+ líneas de documentación

---

## 🎯 Qué Estamos Haciendo

Extraer TODO el código KOL del backend monolito → nuevo app `apps/kol-system/` con **template-based multi-channel publishing**, 14 bounded contexts, arquitectura hexagonal, y UI dashboard completo.

**Resultado Final**:

- ✅ Backend pierde TODO el código KOL (~14k LOC)
- ✅ KOL-system es independiente (puerto 3050/3051/3052)
- ✅ Template system: N canales configurables con diferentes bots/reglas
- ✅ Frontend dashboard: template management + rankings + manual approval
- ✅ Rollback total en 30 min si falla

---

## 📋 Orden de Implementación (11 Fases, 9-10 Semanas)

### **Phase 1: App Setup** (1 semana)

**Goal**: Crear esqueleto funcional de `apps/kol-system/`

**Tareas**:

1. Crear estructura de directorios (14 módulos)

   ```bash
   mkdir -p apps/kol-system/src/{ingestion,extraction,parsing,normalization,enrichment,classification,scoring,templates,approval,publishing,tracking,kol-identity,telegram,shared}
   ```

2. `package.json` + dependencias

   ```json
   {
     "name": "@onchain-bot/kol-system",
     "version": "1.0.0",
     "dependencies": {
       "@nestjs/common": "^11.0.0",
       "@nestjs/core": "^11.0.0",
       "@nestjs/typeorm": "^10.0.0",
       "typeorm": "^0.3.20",
       "pg": "^8.11.0",
       "redis": "^4.6.0",
       "ioredis": "^5.3.0",
       "@nestjs/schedule": "^4.0.0",
       "axios": "^1.6.0",
       "class-validator": "^0.14.0",
       "class-transformer": "^0.5.1"
     }
   }
   ```

3. `nest-cli.json` + `tsconfig.json` (paths para 14 modules)
4. `src/main.ts` (bootstrap, puerto 3050 dev)
5. `src/app.module.ts` (14 imports)
6. `.env.example` (30 vars)
7. Docker Compose dev (postgres + redis)
8. Healthcheck `/api/health`

**Validación**: `curl localhost:3050/api/health` → 200 OK

---

### **Phase 2: Shared Module** (1 semana)

**Goal**: Implementar módulo transversal con 40+ componentes reutilizables

**Tareas**:

1. **Domain** (12 componentes):
   - VOs: `CallId`, `KolId`, `TemplateId`, `Ticker`, `ChainId`, `Score`, `Reputation`
   - Events: `DomainEvent` (base), `CallScoredEvent`, `TemplateActivatedEvent`, `JobPublishedEvent`
   - Exceptions: `KolSystemException`, `InvalidScoreException`, `TemplateNotFoundException`

2. **Infrastructure** (15 componentes):
   - Persistence: `BaseTypeormRepository`, `TransactionManager`
   - HTTP: `HttpClientService`, `RateLimiterInterceptor`
   - Event Bus: `EventBusAdapter` (NestJS EventEmitter)
   - Cache: `CacheService` (Redis wrapper)
   - Monitoring: `MetricsService`, `LoggerService`

3. **Utils** (10+ funciones):
   - `retryWithBackoff()`, `normalizeText()`, `hashContent()`, `chunkArray()`, `deepClone()`

**Validación**: Tests unitarios para cada componente (>80% coverage)

---

### **Phase 3: Ingestion Module** (3 días)

**Goal**: Consumir SSE de `ingestion-telegram` y emitir eventos KOL

**Tareas**:

1. **Infrastructure**:
   - `KolIngestionHttpClient` (GET `/api/feed/kol-messages`, GET `/api/feed/kols`)
   - `IngestionSseListenerAdapter` (subscribe `/api/ingestion/stream`, backoff 1s→30s)

2. **Application**:
   - `ProcessKolMessageHandler` (SSE event → domain event)

3. **Domain**:
   - Event: `KolMessageIngestedEvent`

**Validación**:

- Logs muestran `[IngestionSseListener] Connected to ingestion-telegram:3031`
- Event bus emite `ingestion.kol-message.ingested`

---

### **Phase 4: Extraction BC** (3 días)

**Goal**: Extraer candidatos desde raw text KOL messages

**Tareas**:

1. **Domain**:
   - `ExtractionCandidate` entity (ticker, chainHint, contractAddress)
   - Event: `CandidatesExtractedEvent`

2. **Application**:
   - `ExtractFromMessageUseCase` (regex patterns + NLP)
   - `CandidateExtractorService`

3. **Infrastructure**:
   - TypeORM entity + repository

4. **Handler**:
   - `KolMessageIngestedHandler` (escucha ingestion events)

**Validación**: Raw message "SOL to $200!" → extrae `{ ticker: 'SOL', chainHint: 'solana' }`

---

### **Phase 5: Parsing BC** (3 días)

**Goal**: Parsear candidatos → structured calls

**Tareas**:

1. **Domain**:
   - `ParsedCall` aggregate (ticker, chainId, contractAddress, confidence)
   - Event: `CallParsedEvent`

2. **Application**:
   - `ParseFromCandidatesUseCase`
   - `CallParserService` (ticker validation, chain detection)

3. **Infrastructure**:
   - TypeORM entity + repository

4. **Handler**:
   - `CandidatesExtractedHandler`

**Validación**: Candidato → parsed call con ticker + chain confirmados

---

### **Phase 6: Normalization BC** (3 días)

**Goal**: Normalizar parsed calls (uppercase ticker, canonical chain)

**Tareas**:

1. **Domain**:
   - `NormalizedCall` aggregate
   - Event: `CallNormalizedEvent`

2. **Application**:
   - `NormalizeCallUseCase`

3. **Infrastructure**:
   - TypeORM entity + repository

4. **Handler**:
   - `CallParsedHandler`

**Validación**: `sol` → `SOL`, `eth` → `ETH`

---

### **Phase 7: Enrichment BC** (5 días)

**Goal**: Fetch token metadata (Helius, DexScreener, Birdeye)

**Tareas**:

1. **Domain**:
   - `EnrichedCall` aggregate (+ tokenMetrics, holderCount, liquidity)
   - Events: `CallEnrichedEvent`, `EnrichmentFailedEvent`

2. **Application**:
   - `EnrichCallUseCase`
   - `TokenEnrichmentService` (cascade: Helius → DexScreener → Birdeye)

3. **Infrastructure**:
   - HTTP adapters: `HeliusAdapter`, `DexScreenerAdapter`, `BirdeyeAdapter`
   - TypeORM entity + repository

4. **Handler**:
   - `CallNormalizedHandler`

**Validación**: Normalized call → fetch metadata → enrich (o fail gracefully)

---

### **Phase 8: Classification + Scoring** (4 días)

**Goal**: Classify risk + calculate score

**Tareas**:

1. **Classification BC**:
   - Domain: `ClassifiedCall` + event
   - Application: `ClassifyCallUseCase`
   - Infrastructure: ONNX adapter (opcional, puede ser rule-based v1)

2. **Scoring BC** (CRÍTICO):
   - Domain: `ScoredCall` aggregate (score, tier, kol reputation multiplier)
   - Event: `CallScoredEvent`
   - Application: `ScoreCallUseCase` + `ScoringEngine`
   - Infrastructure: TypeORM persistence

**Formula Scoring**:

```typescript
score = baseScore + tierBonus - riskPenalty;
adjustedScore = score * kolReputationMultiplier;
```

**Validación**: Enriched call → classify → score (50-100 range)

---

### **Phase 9: Templates BC** ⭐ (5 días, **CORE**)

**Goal**: Implementar template system completo (el corazón del diseño robusto)

#### 9.1 Domain (2 días)

1. **Aggregate**: `PublishingTemplate` (full model, 500+ LOC)

   ```typescript
   class PublishingTemplate extends AggregateRoot<TemplateId> {
     private name: string;
     private sourceConfig: SourceConfig; // Qué KOLs incluir
     private pipelineConfig: PipelineConfig; // Qué steps ejecutar
     private rankingConfig: RankingConfig; // Cómo rankear
     private approvalConfig: ApprovalConfig; // Manual/auto/hybrid
     private publishingConfig: PublishingConfig; // Bot + rate limits
     private monitoringConfig: MonitoringConfig; // Alerting

     public rankCalls(calls: ScoredCall[]): RankedCall[];
     public requiresApproval(call: ScoredCall): boolean;
     public createPublishingJob(call: ScoredCall): PublishingJob;
   }
   ```

2. **Value Objects**: 6 VOs (SourceConfig, PipelineConfig, etc.)

3. **Events**: `TemplateCreatedEvent`, `TemplateActivatedEvent`, `TemplateSourceConfigUpdatedEvent`

#### 9.2 Application (2 días)

1. **Use Cases**:
   - `CreateTemplateUseCase`
   - `UpdateTemplateUseCase`
   - `ActivateTemplateUseCase`
   - `GetTemplateRankingsUseCase`

2. **Services** (CRÍTICO):
   - `TemplateOrchestratorService` (main coordinator, cron every 1 min)

     ```typescript
     async processAllTemplates(): Promise<void> {
       const templates = await this.repo.findActive();
       await Promise.all(templates.map(t => this.processTemplate(t)));
     }

     private async processTemplate(template: PublishingTemplate) {
       const calls = await this.scoredCallRepo.findRecent({ limit: 100 });
       const rankedCalls = template.rankCalls(calls);

       for (const rankedCall of rankedCalls) {
         await this.createPublishingJob(template, rankedCall);
       }
     }
     ```

   - `RankingEngineService` (4 strategies)
     - `rankByScore()` → Sort by score desc
     - `rankByEngagement()` → Sort by views + reactions
     - `rankByRecency()` → Exponential decay (100 at 0h, 50 at 12h)
     - `rankWeighted()` → Weighted sum (configurable weights)

#### 9.3 Infrastructure (1 día)

1. **TypeORM entities**: `publishing_templates`, `template_source_filters`, `template_metrics`
2. **Repositories**: `TemplateRepository`, `TemplateMetricsRepository`

#### 9.4 API

1. **Controller**: `TemplatesController` (11 endpoints)
   - `GET /api/templates` (list all)
   - `POST /api/templates` (create)
   - `GET /api/templates/:id` (get one)
   - `PATCH /api/templates/:id` (update)
   - `POST /api/templates/:id/activate` (activate)
   - `POST /api/templates/:id/deactivate` (deactivate)
   - `GET /api/templates/:id/rankings` (get ranked calls)
   - `GET /api/templates/:id/pending-approvals` (for UI)
   - `DELETE /api/templates/:id` (soft delete)

2. **DTOs**: `CreateTemplateDto`, `UpdateTemplateDto`

#### 9.5 Cron Scheduler

```typescript
@Injectable()
export class TemplateProcessingScheduler {
  @Cron('*/1 * * * *') // Every 1 minute
  async handleCron() {
    await this.orchestrator.processAllTemplates();
  }
}
```

**Validación**:

- Crear template vía API → activate → verify cron runs every 1 min
- Manually create scored call → verify template ranks it → creates publishing job
- GET `/api/templates/:id/rankings` → returns ranked calls with scores

**ESTE ES EL PHASE MÁS CRÍTICO** — Sin templates, el sistema vuelve al diseño rígido.

---

### **Phase 10: Approval BC** (3 días, template-aware)

**Goal**: Workflow de approval (manual/auto/hybrid)

**Tareas**:

1. **Domain**:
   - `CallApproval` aggregate (status: pending/approved/rejected)
   - Events: `CallApprovedEvent`, `CallRejectedEvent`

2. **Application**:
   - `EvaluateApprovalUseCase` (auto-approval rules)
   - `GetPendingApprovalsUseCase` (for UI)
   - `ApproveCallUseCase` (manual approve from UI)
   - `RejectCallUseCase` (manual reject from UI)

3. **Infrastructure**:
   - TypeORM entity + repository

4. **Handler**:
   - `CallScoredHandler` → template orchestrator creates jobs → approval workflow

5. **API**:
   - `ApprovalsController`
   - `POST /api/approvals/:jobId/approve`
   - `POST /api/approvals/:jobId/reject`

**Validación**: Publishing job created → check `requires_approval` → UI can approve/reject

---

### **Phase 11: Publishing BC** (4 días, multi-bot)

**Goal**: Publish to Telegram con múltiples bots

**Tareas**:

1. **Domain**:
   - `PublishingJob` aggregate (templateId, callId, status, rank, attempts)
   - Events: `JobPublishedEvent`, `JobPublicationFailedEvent`

2. **Application**:
   - `PublishFromTemplateUseCase` (uses template's botConfig)
   - `ManualPublishUseCase` (UI trigger)
   - `VipPublisherService`

3. **Infrastructure**:
   - `MultiBotPublisherAdapter` (N bots simultaneously)
     ```typescript
     class MultiBotPublisherAdapter {
       private bots = new Map<string, TelegramBotClient>();

       async publish(job: PublishingJob, botConfig: BotConfig) {
         const bot = this.getBotClient(botConfig.botToken);
         const message = await bot.sendMessage({
           chatId: botConfig.chatId,
           text: this.formatMessage(job),
         });
         return message.message_id;
       }
     }
     ```
   - TypeORM entity + repository

4. **Handler**:
   - `JobApprovedHandler` (auto-publish if auto-approval)

5. **Cron**:
   - `PublishingScheduler` (drain approved jobs every 1 min)

**Validación**: Approved job → publish to Telegram (correct bot per template) → verify messageId

---

### **Phase 12: Tracking BC** (3 días)

**Goal**: Track call performance (price snapshots, ROI)

**Tareas**:

1. **Domain**:
   - `CallTracking` aggregate (priceSnapshots[], currentPrice, highestPrice, roi)
   - Event: `EvaluationCompletedEvent`

2. **Application**:
   - `TrackCallUseCase` (snapshot prices every 1h for 24h)
   - `EvaluatePerformanceUseCase` (calculate ROI at 24h)

3. **Infrastructure**:
   - TypeORM entity + repository
   - Price fetcher (DexScreener or CoinGecko)

4. **Handler**:
   - `JobPublishedHandler`

5. **Cron**:
   - `PriceSnapshotScheduler` (every 1h)
   - `EvaluationScheduler` (every 24h, evaluate completed calls)

**Validación**: Published call → track price 24h → evaluate ROI (positive/negative)

---

### **Phase 13: KOL Identity BC** (3 días, migrado desde backend)

**Goal**: Migrar `apps/backend/src/kol/` completo

**Tareas**:

1. **Mover archivos**:

   ```bash
   cp -r apps/backend/src/kol/* apps/kol-system/src/kol-identity/
   ```

2. **Adaptar a nueva estructura**:
   - Renombrar `kol/` → `kol-identity/`
   - Separar domain entities de TypeORM entities
   - Crear ports/adapters

3. **API**:
   - `KolsController`
   - `GET /api/kols` (list active)
   - `POST /api/kols` (create)
   - `PATCH /api/kols/:id/reputation` (update)

**Validación**: GET `/api/kols` → returns KOL list with reputation scores

---

## 🗂️ Database Schema (Migration Strategy)

### Crear Baseline Migration

```bash
cd apps/kol-system
npm run migration:generate -- -n BaselineKolSystem
```

**Tablas a crear** (22 total):

```sql
-- Core pipeline tables
CREATE TABLE extraction_candidates (...);
CREATE TABLE parsed_calls (...);
CREATE TABLE normalized_calls (...);
CREATE TABLE enriched_calls (...);
CREATE TABLE classified_calls (...);
CREATE TABLE scored_calls (...);

-- Template system (CRÍTICO)
CREATE TABLE publishing_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  active BOOLEAN DEFAULT FALSE,
  source_config JSONB NOT NULL,      -- { type, filters }
  pipeline_config JSONB NOT NULL,    -- { enabledSteps, scoringRules }
  ranking_config JSONB NOT NULL,     -- { strategy, limit, filters }
  approval_config JSONB NOT NULL,    -- { mode, autoApprovalRules }
  publishing_config JSONB NOT NULL,  -- { botToken, chatId, rateLimits }
  monitoring_config JSONB,           -- { metricsEnabled, alerting }
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE template_source_filters (...);
CREATE TABLE template_metrics (...);

-- Publishing tables
CREATE TABLE publishing_jobs (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES publishing_templates(id),
  call_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  rank INTEGER,
  attempts INTEGER DEFAULT 0,
  UNIQUE(template_id, call_id)
);

CREATE TABLE call_approvals (...);
CREATE TABLE published_calls (...);

-- Tracking tables
CREATE TABLE call_tracking (...);
CREATE TABLE call_evaluations (...);

-- KOL identity tables
CREATE TABLE kols (...);
CREATE TABLE kol_channels (...);
CREATE TABLE kol_reputation (...);
CREATE TABLE kol_stats (...);

-- Shared tables
CREATE TABLE event_store (...);
CREATE TABLE integration_events (...);
CREATE TABLE pipeline_config (...);
```

---

## 🎨 Frontend UI Implementation

### Routes

```typescript
// apps/frontend/src/app/routes.tsx
{
  path: '/kol-system',
  children: [
    { path: 'templates', element: <TemplateListPage /> },
    { path: 'templates/new', element: <CreateTemplatePage /> },
    { path: 'templates/:id', element: <TemplateDetailPage /> },
    { path: 'templates/:id/edit', element: <EditTemplatePage /> },
    { path: 'templates/:id/rankings', element: <TemplateRankingsPage /> },
    { path: 'templates/:id/approvals', element: <PendingApprovalsPage /> },
  ],
}
```

### Components (FSD Structure)

```
apps/frontend/src/
├── features/
│   └── kol-system/
│       ├── template-list/
│       │   ├── ui/
│       │   │   ├── TemplateCard.tsx
│       │   │   └── TemplateListView.tsx
│       │   └── model/
│       │       └── useTemplates.ts
│       │
│       ├── template-form/
│       │   ├── ui/
│       │   │   ├── TemplateForm.tsx
│       │   │   ├── SourceConfigSection.tsx
│       │   │   ├── PipelineConfigSection.tsx
│       │   │   ├── RankingConfigSection.tsx
│       │   │   └── PublishingConfigSection.tsx
│       │   └── model/
│       │       └── useCreateTemplate.ts
│       │
│       ├── template-rankings/
│       │   ├── ui/
│       │   │   ├── RankingsTable.tsx
│       │   │   └── RankingStrategyBadge.tsx
│       │   └── model/
│       │       └── useTemplateRankings.ts
│       │
│       └── pending-approvals/
│           ├── ui/
│           │   ├── ApprovalCard.tsx
│           │   ├── CallDetailsModal.tsx
│           │   └── ApprovalActions.tsx
│           └── model/
│               ├── usePendingApprovals.ts
│               ├── useApproveCall.ts
│               └── useRejectCall.ts
│
├── entities/
│   └── kol-system/
│       ├── template/
│       │   └── model/
│       │       ├── types.ts
│       │       └── api.ts
│       └── publishing-job/
│           └── model/
│               ├── types.ts
│               └── api.ts
│
└── shared/
    └── api/
        └── kol-system.ts
```

### TanStack Query Hooks

```typescript
// features/kol-system/template-list/model/useTemplates.ts
export function useTemplates(activeOnly = false) {
  return useQuery({
    queryKey: ['kol-templates', activeOnly],
    queryFn: () => kolSystemApi.getTemplates({ activeOnly }),
    refetchInterval: 30000, // 30s
  });
}

// features/kol-system/pending-approvals/model/useApproveCall.ts
export function useApproveCall(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => kolSystemApi.approveJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries(['pending-approvals', templateId]);
      queryClient.invalidateQueries(['template-metrics', templateId]);
    },
  });
}
```

---

## 🔄 Migration Strategy (Backend → KOL System)

### Phase 1: Mark as @deprecated (Semana 1)

```typescript
/**
 * @deprecated Moved to apps/kol-system/
 * Use KolSystemModule from kol-system app instead.
 * This will be removed in v3.0.0 (ETA: 2026-12-31)
 *
 * Migration guide: /docs/migrations/backend-kol-to-kol-system.md
 *
 * @see {@link apps/kol-system/src/kol-identity/}
 */
@Injectable()
export class KolService {
  // ... existing code
}
```

Aplicar a:

- `apps/backend/src/kol/` (4 subdirectorios, 31 archivos)
- `apps/backend/src/telegram/ingestion/kol/` (22 archivos)
- `apps/backend/src/telegram/vip-calls/` (31 archivos)

**Total**: ~84 archivos marcados como deprecated

---

### Phase 2: Dual-Run Period (Semanas 2-8)

Durante implementación de `apps/kol-system/`:

- Backend KOL pipeline continúa funcionando (legacy)
- `kol-system` recibe MISMOS eventos vía `ingestion-telegram` (paralelo)
- **NO eliminar código backend todavía**
- Comparar outputs side-by-side (logs, published calls)

**Env var para toggle**:

```bash
# Backend
KOL_PIPELINE_ENABLED=true  # Keep true during dual-run

# KOL-system
KOL_SYSTEM_ENABLED=true    # Enable when ready
```

---

### Phase 3: Cutover (Semana 9)

**Checklist pre-cutover**:

- ✅ KOL-system E2E tests green (>200 tests, >80% coverage)
- ✅ Load testing passed (100 calls/hour for 24h)
- ✅ Frontend dashboard production-ready
- ✅ Monitoring dashboards configured (Grafana + Prometheus)
- ✅ Rollback plan documented
- ✅ On-call engineer assigned

**Cutover steps**:

1. **Staging first** (validate 48h)

   ```bash
   # Staging backend
   KOL_PIPELINE_ENABLED=false

   # Staging kol-system
   KOL_SYSTEM_ENABLED=true
   ```

2. **Production cutover** (Blue/Green deploy)
   - Deploy `kol-system` to prod (inactive: `TEMPLATE_ORCHESTRATOR_ENABLED=false`)
   - Verify health checks pass
   - Activate orchestrator: `TEMPLATE_ORCHESTRATOR_ENABLED=true`
   - Monitor 30 min (error rate, publish rate, latency)
   - Disable backend KOL pipeline: `KOL_PIPELINE_ENABLED=false`
   - Monitor 2h (full observation)

3. **Rollback if needed** (within 30 min)

   ```bash
   # Re-enable backend
   KOL_PIPELINE_ENABLED=true

   # Disable kol-system
   TEMPLATE_ORCHESTRATOR_ENABLED=false
   ```

---

### Phase 4: Cleanup (Semana 10)

**After 7 days successful production run**:

1. **Delete backend KOL code**:

   ```bash
   rm -rf apps/backend/src/kol/
   rm -rf apps/backend/src/telegram/ingestion/kol/
   rm -rf apps/backend/src/telegram/vip-calls/
   ```

2. **Archive tables** (DO NOT DROP):

   ```sql
   -- Move to archived schema
   ALTER TABLE public.kols SET SCHEMA _archived;
   ALTER TABLE public.kol_channels SET SCHEMA _archived;
   -- ... (all KOL tables)
   ```

3. **Update docs**:
   - Remove KOL sections from `apps/backend/AGENTS.md`
   - Update root `AGENTS.md` with new architecture
   - Update deployment guides

---

## 🚨 Critical Success Factors

### 1. Template BC is CORE

**Phase 9 (Templates BC)** desbloquea toda la flexibilidad del sistema. Si se implementa mal, el sistema entero falla.

**Red flags**:

- ❌ Template orchestrator no corre cada 1 min
- ❌ Ranking strategies no funcionan correctamente
- ❌ Rate limiting per-template no se respeta
- ❌ Auto-approval rules no aplican

**Validation checklist**:

- ✅ Create 3 templates con diferentes configs
- ✅ Activate all 3 simultaneously
- ✅ Verify each processes independently
- ✅ Verify correct bot used per template
- ✅ Verify rate limits enforced

---

### 2. Multi-Bot Publishing Works

**Phase 11** debe soportar N bots concurrentes sin conflicts.

**Test scenario**:

```typescript
// Create 3 templates with different bots
const template1 = { botToken: 'BOT_1', chatId: 'CHANNEL_1' };
const template2 = { botToken: 'BOT_2', chatId: 'CHANNEL_2' };
const template3 = { botToken: 'BOT_3', chatId: 'CHANNEL_3' };

// Publish same call to all 3 channels simultaneously
await Promise.all([
  publishToTemplate(call, template1),
  publishToTemplate(call, template2),
  publishToTemplate(call, template3),
]);

// Verify: 3 different messageIds, 3 different bots used
```

---

### 3. Frontend Dashboard is Production-Ready

UI debe ser **usable**, no solo funcional.

**UX requirements**:

- ✅ Load rankings in <2s
- ✅ Approve/reject actions respond in <1s
- ✅ Real-time updates (polling every 10s)
- ✅ Error handling with user-friendly messages
- ✅ Optimistic updates (instant feedback)

---

### 4. Event-Driven Pipeline is Reliable

**No event loss** — cada call debe pasar por el pipeline completo.

**Reliability measures**:

- ✅ Event store (audit trail)
- ✅ Dead letter queue for failed events
- ✅ Retry with exponential backoff (3 attempts)
- ✅ Monitoring alerts on high failure rate

---

## 📊 Testing Strategy

### Unit Tests (>80% coverage)

```bash
# Per BC
npm run test -- --testPathPattern=templates
npm run test -- --testPathPattern=scoring
npm run test -- --testPathPattern=publishing
```

### Integration Tests

```typescript
// Template orchestrator E2E
describe('TemplateOrchestratorService', () => {
  it('should process all active templates', async () => {
    // Given: 2 active templates, 5 scored calls
    const templates = await createTemplates(2);
    const calls = await createScoredCalls(5);

    // When: Orchestrator runs
    await orchestrator.processAllTemplates();

    // Then: Publishing jobs created per template
    const jobs = await jobRepo.findAll();
    expect(jobs).toHaveLength(10); // 2 templates × 5 calls
  });
});
```

### E2E Tests

```typescript
// Full pipeline: ingestion → publishing
it('should publish call from ingestion to Telegram', async () => {
  // Given: Active template with auto-approval
  const template = await createTemplate({
    approvalConfig: { mode: 'auto' },
  });

  // When: KOL message ingested
  await ingestKolMessage({ text: 'SOL to $200!' });

  // Wait for pipeline (max 2 min)
  await waitForCondition(
    () => publishedCallRepo.findOne({ ticker: 'SOL' }),
    120000,
  );

  // Then: Call published to Telegram
  const published = await publishedCallRepo.findOne({ ticker: 'SOL' });
  expect(published.telegramMessageId).toBeDefined();
  expect(published.templateId).toEqual(template.id);
});
```

---

## 🎯 Success Metrics

### Technical Metrics

- ✅ Pipeline latency: <2 min (ingestion → publishing)
- ✅ Template processing: <10s per template
- ✅ Ranking computation: <1s for 100 calls
- ✅ API response time: p95 <500ms
- ✅ Test coverage: >80% (all BCs)
- ✅ Zero event loss (audit trail confirms)

### Business Metrics

- ✅ Publish rate: 5-20 calls/day per template (configurable)
- ✅ Approval latency: <5 min (manual) / <1 min (auto)
- ✅ False positive rate: <10% (rejected after publish)
- ✅ Template uptime: >99.5%
- ✅ Multi-bot concurrency: 5+ templates simultaneously

---

## 🚀 Quick Start (Day 1)

```bash
# 1. Create app structure
mkdir -p apps/kol-system/src/{ingestion,extraction,parsing,normalization,enrichment,classification,scoring,templates,approval,publishing,tracking,kol-identity,telegram,shared}

# 2. Copy template files
cp apps/backend/nest-cli.json apps/kol-system/
cp apps/backend/tsconfig.json apps/kol-system/

# 3. Install dependencies
cd apps/kol-system
npm install

# 4. Create main.ts
cat > src/main.ts << 'EOF'
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3050);
  console.log('KOL System running on :3050');
}
bootstrap();
EOF

# 5. Create app.module.ts (empty for now)
cat > src/app.module.ts << 'EOF'
import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
EOF

# 6. Run
npm run start:dev

# 7. Test healthcheck
curl http://localhost:3050/api/health
```

---

## 📚 Referencias

- [KOL System Overview](./overview.md) — Arquitectura completa (1000+ líneas)
- [Content Publisher Refactor](../refactor-content-publisher/11-refactor.md) — Patrón de referencia
- [AGENTS.md](../../AGENTS.md) — Context sobre pipeline actual
- [Backend AGENTS.md](../../apps/backend/AGENTS.md) — Detalles de implementación actual

---

**Versión**: 2.0  
**Autor**: AI Assistant  
**Fecha**: 2026-09-24  
**Duración estimada**: 9-10 semanas  
**Estado**: Ready for Implementation
