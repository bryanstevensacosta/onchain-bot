# crypto-news-ingestion - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** The Telegram ingestion layer restructured into three clean sub-modules (shared infrastructure, KOL-specific, and crypto-news-specific). KOL seeds stay as they are. A new crypto-news BC is created with its own seed list, seeder, database tables (`crypto_news_sources`, `crypto_news_messages`), and message storage flow — fully independent from the KOL alpha pipeline. A single coordinator subscribes to all channels and routes each message to the right handler. A new `/crypto-news` page in the frontend displays the ingested news.

**Why this approach:** The existing Kol aggregate (Key Opinion Leader) is semantically wrong for storing news sources. Creating a separate BC avoids domain coupling, follows DDD/hexagonal patterns, and keeps the alpha pipeline untouched. The single-subscription coordinator works around the Telegram listener's "one subscriber" constraint.

**What it will NOT do:** Rename or refactor the Kol aggregate. Change any existing KOL alpha pipeline logic. Modify any existing frontend pages for KOLs. Add real-time WebSocket support for news (MVP stores-and-serves only). Scrape or transform news content.

**Effort:** Large
**Risk:** Medium - touches module wiring, app config, and moves artifacts between BCs
**Decisions to sanity-check:** IngestionCoordinator design (single subscription + routing), seed file format for news, env var names for news seed toggle

Your next move: Run `$start-work` to execute the plan.

---

> **TL;DR (machine):** Effort=Large, Risk=Medium. Restructure telegram/ingestion/ into 3 sub-BCs. Move KOL seeds/seeder. Create crypto-news BC with own tables + message storage. IngestionCoordinator for unified subscription + routing. New frontend page.

## Scope
### Must have
- Structure `telegram/ingestion/` as 3 sub-modules: `shared/`, `kol/`, `crypto-news/`
- Move KOL seeds and seeder from `kol/identity/` to `telegram/ingestion/kol/`
- New crypto-news BC with domain entities, ports, use cases, persistence
- New DB tables: `crypto_news_sources` (news channel registry), `crypto_news_messages` (news messages)
- `CryptoNewsSeeder` that registers news channels on boot
- `StoreNewsMessageUseCase` that persists incoming news messages
- `IngestionCoordinator` that subscribes once and routes messages by channel type
- New env vars: `INGESTION_TELEGRAM_NEWS_SEED_ENABLED`, `INGESTION_TELEGRAM_SEED_NEWS`
- Frontend: new page `/crypto-news` with backend `GET /crypto-news/messages`
- Tests for all new code (unit + integration)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do NOT add `channelType` to the `kols` table or Kol aggregate
- Do NOT modify `kol/identity/` domain entity, API endpoints, or existing use cases
- Do NOT change the KOL alpha pipeline (extraction → parsing → normalization → ...)
- Do NOT modify existing frontend KOL pages
- Do NOT implement real-time WebSocket for news (read-only page for MVP)
- Do NOT scrape or transform news content — store as-is
- Do NOT create a separate MTProto session or listener for news (share with KOLs)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- **Test decision:** TDD for new crypto-news BC; tests-after for restructuring moves
- **Framework:** Jest (co-located `*.spec.ts`), existing pattern
- **Evidence:** `.omo/evidence/task-<N>-crypto-news-ingestion.<ext>`

## Execution strategy
### Parallel execution waves
- **Wave 1** (T1–T2): Restructure shared/ + move KOL artifacts (no new logic, safe)
- **Wave 2** (T3–T4): Create crypto-news domain + application layer (pure TS, no I/O)
- **Wave 3** (T5): Create crypto-news infrastructure (persistence, seeds, seeder)
- **Wave 4** (T6): IngestionCoordinator + routing logic (most risk — touches message flow)
- **Wave 5** (T7–T8): Config + module wiring + DB entities registration
- **Wave 6** (T9): Frontend page + backend endpoint
- **Wave 7** (T10): Tests for all new code

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1. shared/ restructuring | — | T5, T6 | T2 |
| T2. Move KOL seeder | — | T6 | T1 |
| T3. Crypto-news domain | T1 | T4 | — |
| T4. Crypto-news app layer | T3 | T5 | — |
| T5. Crypto-news infra | T4 | T6 | — |
| T6. IngestionCoordinator | T1, T2, T5 | T7 | — |
| T7. Config + module wiring | T6 | T8 | — |
| T8. DB entities registration | T7 | T9 | — |
| T9. Frontend + API endpoint | T8 | T10 | — |
| T10. Tests | T3, T4, T5, T9 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Restructure `telegram/ingestion/` into `shared/` sub-module
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/shared/` directory with the subdirectories preserving the current structure:
    - `api/http/` ← move `ingestion-config.controller.ts`, `ingestion-health.controller.ts`
    - `api/input/` ← move `start-ingestion.input.ts`
    - `api/mtproto/` ← move `telegram-mtproto-listener.adapter.ts`
    - `domain/ports/` ← move `telegram-listener.port.ts`
    - `infrastructure/config/` ← move `ingestion-safety.config.ts`
    - `infrastructure/services/` ← move `flood-wait-handler.service.ts`, `flood-wait-counter.service.ts`, `sleep-window.service.ts`
  - Create `telegram/ingestion/shared/shared-ingestion.module.ts` that provides all the above providers and exports `TelegramListenerPort` + `IngestionSafetyConfig`.
  - Update `telegram/ingestion/telegram-ingestion.module.ts` to import `SharedIngestionModule`.
  - Update ALL import paths across the project that reference the moved files (use `codegraph_callers` to find every reference).
  - Must NOT: change any logic — this is a pure file move + import update.
  - Must NOT: delete the old files until all imports are confirmed updated.
  - **Parallelization:** Wave 1 | Blocked by: — | Blocks: T5, T6
  - **References:**
    - `apps/backend/src/telegram/ingestion/` — existing structure
    - `apps/backend/src/telegram/ingestion/telegram-ingestion.module.ts:1-26` — current module
    - `apps/backend/src/telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts` — listener (most referenced)
    - Use codegraph to find all import references to `telegram/ingestion/` paths
  - **Acceptance criteria:**
    - `shared/` directory mirrors the previous flat structure exactly
    - All imports across the project resolve to new paths
    - `npm run build` passes
    - `npm run test:backend` passes
  - **QA scenarios:** Build passes, tests pass, health endpoint at `GET /ingestion/health` works
  - **Commit:** `Y` | `refactor(ingestion): restructure telegram/ingestion into shared/ sub-module`

- [x] 2. Move KOL seeds and seeder to `telegram/ingestion/kol/`
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/kol/seeds/kol.seed.ts` — identical copy of current `kol/identity/infrastructure/seeds/kol.seed.ts`
  - Create `telegram/ingestion/kol/seeders/kol.seeder.ts` — copy of `kol/identity/infrastructure/seeders/kol.seeder.ts` with these MODIFICATIONS:
    - Remove `OnApplicationBootstrap` implementation (auto-start on boot will be handled by IngestionCoordinator)
    - Add explicit `public async seed(): Promise<{ added: number; skipped: number; failed: number; notAKol: number }>` method (idempotent, can be called by coordinator)
    - Keep all existing logic (resolveMetadata, RegisterKolUseCase calls, etc.)
  - Create `telegram/ingestion/kol/kol-ingestion.module.ts`:
    - Provides `KolSeeder` 
    - Imports `ConfigModule` (needed for seed config)
  - Update `kol/identity/identity.module.ts`:
    - Remove `KolSeeder` from providers
    - Remove `KolSeeder` import
  - Update `kol/identity/infrastructure/seeds/kol.seed.ts` → DELETE (moved)
  - Update `kol/identity/infrastructure/seeders/kol.seeder.ts` → DELETE (moved)
  - Must NOT: change KolSeeder resolution/metadata/registration logic — only remove auto-start
  - Must NOT: modify RegisterKolUseCase, KolRepository, or any other kol/identity artifact
  - **Parallelization:** Wave 1 | Blocked by: — | Blocks: T6
  - **References:**
    - `apps/backend/src/kol/identity/infrastructure/seeds/kol.seed.ts:1-75` — seed list
    - `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:27-372` — seeder
    - `apps/backend/src/kol/identity/identity.module.ts:74` — KolSeeder provider
    - `apps/backend/src/kol/identity/identity.module.ts:21` — KolSeeder import
  - **Acceptance criteria:**
    - `kol-ingestion.module.ts` exists and provides KolSeeder
    - KolSeeder has `seed()` method (no OnApplicationBootstrap)
    - `kol/identity/` no longer references KolSeeder
    - `npm run build` passes
  - **QA scenarios:** Build passes, all KOL seed tests pass, KolSeeder can be called manually
  - **Commit:** `Y` | `refactor(ingestion): move KOL seeds/seeder to telegram/ingestion/kol/ sub-module`

- [x] 3. Create crypto-news domain layer
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity.ts` (aggregate root):
    ```
    CryptoNewsSource extends AggregateRoot<string> {
      state: {
        channelId: string;        // Telegram peer ID (same format as KolId)
        handle: string | null;    // @username
        title: string;            // Resolved channel title
        isActive: boolean;        // Whether ingestion is active
        addedAt: Date;
      }
      static create(input: { channelId: string; handle?: string; title: string }): CryptoNewsSource
      static reconstitute(props: {...}): CryptoNewsSource
      activate() / deactivate()
      recordMessageIngested(messageId: number, occurredAt: Date): void
    }
    ```
  - Create `telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts`:
    ```
    CryptoNewsMessage {
      id: string (UUID);
      channelId: string;
      messageId: number;
      title: string | null;
      content: string;
      publishedAt: Date;
      ingestedAt: Date;
    }
    ```
    Note: This is NOT an aggregate root — it's a record/entity. No domain events needed.
  - Create `telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event.ts`:
    ```
    CryptoNewsMessageIngestedEvent extends DomainEvent {
      payload: { channelId: string; messageId: number; title: string | null; occurredAt: Date }
    }
    ```
  - Create `telegram/ingestion/crypto-news/domain/events/crypto-news-source-seeded.event.ts`:
    ```
    CryptoNewsSourceSeededEvent extends DomainEvent {
      payload: { channelId: string; title: string; handle: string | null }
    }
    ```
  - Must NOT: extend Kol or KolId — crypto-news uses its own identity
  - Must NOT: couple to any KOL concept
  - **Parallelization:** Wave 2 | Blocked by: T1 | Blocks: T4
  - **References:**
    - `apps/backend/src/kol/identity/domain/entities/kol.entity.ts:32-159` — existing aggregate pattern
    - `apps/backend/src/shared/kernel/aggregate-root.ts` — base class
    - `apps/backend/src/shared/kernel/domain-error.ts` — error codes
    - `apps/backend/src/shared/kernel/domain-event.ts` — event base class
  - **Acceptance criteria:**
    - CryptoNewsSource can be created, activated, deactivated
    - CryptoNewsMessage can hold all required fields
    - Events extend DomainEvent correctly
    - TypeScript compiles without errors
  - **QA scenarios:** Unit test: create CryptoNewsSource → verify fields. Create with empty title → expect DomainError. Events serialize correctly.
  - **Commit:** `Y` | `feat(crypto-news): add crypto-news domain entities and events`

- [x] 4. Create crypto-news application layer
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository.ts`:
    ```
    abstract class CryptoNewsSourceRepository {
      abstract save(source: CryptoNewsSource): Promise<void>;
      abstract findByChannelId(channelId: string): Promise<CryptoNewsSource | null>;
      abstract findAll(): Promise<ReadonlyArray<CryptoNewsSource>>;
      abstract findActive(): Promise<ReadonlyArray<CryptoNewsSource>>;
      abstract delete(channelId: string): Promise<void>;
    }
    ```
  - Create `telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository.ts`:
    ```
    abstract class CryptoNewsMessageRepository {
      abstract save(message: CryptoNewsMessage): Promise<void>;
      abstract findRecent(limit: number): Promise<ReadonlyArray<CryptoNewsMessage>>;
      abstract findByChannelId(channelId: string, limit: number): Promise<ReadonlyArray<CryptoNewsMessage>>;
      abstract findById(id: string): Promise<CryptoNewsMessage | null>;
    }
    ```
  - Create `telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher.ts`:
    ```
    abstract class CryptoNewsEventPublisher {
      abstract publishAll(events: DomainEvent[]): Promise<void>;
    }
    ```
  - Create `telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case.ts` (RegisterNewsSourceUseCase):
    - Validates channelId (numeric Telegram ID)
    - Creates CryptoNewsSource
    - Saves via repo
    - Publishes events
  - Create `telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case.ts` (StoreNewsMessageUseCase):
    ```
    execute(input: { channelId: string; messageId: number; text: string; occurredAt: Date }): Promise<void>
    ```
    - Creates CryptoNewsMessage
    - Saves via repo
    - Publishes CryptoNewsMessageIngestedEvent
  - Must NOT: use any KOL concepts or imports from kol/ BC
  - **Parallelization:** Wave 2 | Blocked by: T3 | Blocks: T5
  - **References:**
    - `apps/backend/src/kol/identity/application/ports/kol.repository.ts:1-25` — repo port pattern
    - `apps/backend/src/kol/identity/application/ports/kol-event.publisher.ts` — publisher pattern
    - `apps/backend/src/kol/identity/application/handlers/register-kol.use-case.ts:1-44` — use case pattern
  - **Acceptance criteria:**
    - All ports defined as abstract classes
    - RegisterNewsSourceUseCase compiles with its dependencies
    - StoreNewsMessageUseCase compiles with its dependencies
  - **QA scenarios:** Unit test RegisterNewsSourceUseCase with in-memory repo. Unit test StoreNewsMessageUseCase.
  - **Commit:** `Y` | `feat(crypto-news): add crypto-news application ports and use cases`

- [x] 5. Create crypto-news infrastructure layer
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity.ts` (TypeORM):
    - Table: `crypto_news_sources`
    - Columns: `channel_id` (PK, varchar), `handle` (varchar, nullable), `title` (varchar), `is_active` (boolean), `added_at` (timestamptz), `updated_at` (timestamptz)
  - Create `telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts` (TypeORM):
    - Table: `crypto_news_messages`
    - Columns: `id` (PK, UUID), `channel_id` (varchar), `message_id` (integer), `title` (varchar, nullable), `content` (text), `published_at` (timestamptz), `ingested_at` (timestamptz)
- Index: `idx_crypto_news_messages_channel_id` on `channel_id`
- Index: `idx_crypto_news_messages_ingested_at` on `ingested_at`
  - Create TypeORM mappers (source + message) to convert between domain and persistence
  - Create `InMemoryCryptoNewsSourceRepository` (for tests / no-DB mode)
  - Create `InMemoryCryptoNewsMessageRepository` (for tests / no-DB mode)
  - Create `TypeOrmCryptoNewsSourceRepository`
  - Create `TypeOrmCryptoNewsMessageRepository`
  - Create `InProcessCryptoNewsEventPublisher`
  - Create `telegram/ingestion/crypto-news/infrastructure/seeds/crypto-news.seed.ts`:
    ```
    export interface SeedChannel {
      readonly channelId: string;
      readonly handle?: string;
      readonly title?: string;
      readonly username?: string;
    }
    
    export const CRYPTO_NEWS_SEED: ReadonlyArray<SeedChannel> = [
      // Placeholder — user fills in actual news channel IDs
      // { channelId: '...', title: 'CoinDesk', handle: 'coindesk' },
      // { channelId: '...', title: 'CoinTelegraph', handle: 'cointelegraph' },
    ];
    ```
    Note: Use `SeedChannel` interface (not `SeedKol`) to keep concepts separate. Name it `SeedChannel` instead of `SeedNewsChannel` for brevity, or `SeedNewsChannel` for clarity.
  - Create `telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder.ts`:
    - Similar to KolSeeder but for news channels
    - Inject `CryptoNewsSourceRepository`, `RegisterNewsSourceUseCase`, `ConfigService`, `TelegramListenerPort`
    - `seed()` method: iterates over `CRYPTO_NEWS_SEED` (or env override), resolves metadata via Telegram, registers each source
    - No auto-start listening (coordinator handles it)
  - Must NOT: reuse SeedKol or KOL_SEED — create independent types
  - Must NOT: import anything from kol/ BC
  - **Parallelization:** Wave 3 | Blocked by: T4 | Blocks: T6
  - **References:**
    - `apps/backend/src/kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts:1-57` — TypeORM entity pattern
    - `apps/backend/src/kol/identity/infrastructure/repositories/in-memory-kol.repository.ts` — in-memory repo pattern
    - `apps/backend/src/kol/identity/infrastructure/persistence/typeorm/repositories/typeorm-kol.repository.ts` — TypeORM repo pattern
    - `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:27-372` — seeder pattern
  - **Acceptance criteria:**
    - TypeORM entities compile with correct table names and columns
    - In-memory repos function correctly (findAll, save, findByChannelId)
    - Seeder can resolve metadata and register sources
    - `CRYPTO_NEWS_SEED` array exists with at least one placeholder entry
  - **QA scenarios:** Unit test in-memory repos. Unit test seeder with mock listener. Verify TypeORM entities match expected schema.
  - **Commit:** `Y` | `feat(crypto-news): add crypto-news persistence, repos, seeds, and seeder`

- [x] 6. Create IngestionCoordinator in shared/ for unified message routing
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/shared/application/ingestion-coordinator.service.ts`:
    ```
    @Injectable()
    export class IngestionCoordinator implements OnApplicationBootstrap {
      constructor(
        private readonly kolSeeder: KolSeeder,              // from telegram/ingestion/kol/
        private readonly cryptoNewsSeeder: CryptoNewsSeeder, // from telegram/ingestion/crypto-news/
        private readonly kolRepo: KolRepository,             // from kol/identity
        private readonly cryptoNewsSourceRepo: CryptoNewsSourceRepository,
        private readonly kolOrchestrator: KolIngestionOrchestratorUseCase,
        private readonly storeNewsMessage: StoreNewsMessageUseCase,
        private readonly listener: TelegramListenerPort,
        private readonly config: ConfigService,
      ) {}
      
      async onApplicationBootstrap(): Promise<void> {
        // 1. Check if seeding is enabled
        const kolSeedConfig = this.config.get('app.ingestion.telegram.seed');
        const newsSeedConfig = this.config.get('app.ingestion.telegram.newsSeed');
        
        // 2. Seed KOLs if enabled
        if (kolSeedConfig?.enabled) await this.kolSeeder.seed();
        
        // 3. Seed news channels if enabled
        if (newsSeedConfig?.enabled) await this.cryptoNewsSeeder.seed();
        
        // 4. Check if auto-start is enabled
        const shouldAutoStart = kolSeedConfig?.autoStartListening ?? true;
        if (!shouldAutoStart) return;
        
        // 5. Collect ALL active channels from both repos
        const activeKols = (await this.kolRepo.findAll()).filter(k => k.isActive);
        const activeNews = (await this.cryptoNewsSourceRepo.findActive());
        const allChannelIds = [
          ...activeKols.map(k => k.kolId.value),
          ...activeNews.map(s => s.channelId),
        ];
        
        if (allChannelIds.length === 0) return;
        
        // 6. Subscribe once and route
        this.consumeAll(allChannelIds);
      }
      
      private async consumeAll(channelIds: string[]): Promise<void> {
        for await (const raw of this.listener.subscribe(channelIds)) {
          // Check if this is a news source
          const newsSource = await this.cryptoNewsSourceRepo.findByChannelId(raw.peerId);
          if (newsSource) {
            await this.storeNewsMessage.execute({
              channelId: raw.peerId,
              messageId: raw.messageId,
              text: raw.text,
              occurredAt: raw.occurredAt,
            });
          } else {
            // Route to KOL pipeline
            await this.kolOrchestrator.onMessageReceived(raw);
          }
        }
      }
    }
    ```
  - Add `public async onMessageReceived(raw: TelegramRawMessage): Promise<void>` method to `KolIngestionOrchestratorUseCase` — wraps the existing private `processMessage` method:
    ```
    public async onMessageReceived(raw: TelegramRawMessage): Promise<void> {
      await this.processMessage(raw);
    }
    ```
  - Modify `KolIngestionOrchestratorUseCase`:
    - Remove the `consumeStream()` private method (no longer needed — coordinator passes raw messages directly)
    - Keep `execute()` but change it to NOT start subscription — it only persists KOL startListening state
    - OR: keep `execute()` as-is for backward compat but the coordinator never calls it — instead calls `onMessageReceived` per message
  - Remove auto-start from `kol.seeder.ts` (already done in T2)
  - Must NOT: duplicate the subscription — only ONE call to `listener.subscribe()`
  - Must NOT: couple KOL and news handling logic — routing is via separate use case calls
  - Must NOT: leak raw Telegram text into events (fix-1 compliance — `StoreNewsMessageUseCase` persists text but does NOT emit it in events; events carry only metadata)
  - **Parallelization:** Wave 4 | Blocked by: T1, T2, T5 | Blocks: T7
  - **References:**
    - `apps/backend/src/kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts:63-67` — current consumeStream
    - `apps/backend/src/kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts:74-129` — processMessage (make public)
    - `apps/backend/src/telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts:77-115` — subscribe() CONFLICT guard
    - `apps/backend/src/kol/identity/application/ports/kol.repository.ts:1-25` — KolRepository
    - `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:126-141` — current auto-start that moves to coordinator
  - **Acceptance criteria:**
    - `npm run build` passes
    - `IngestionCoordinator` subscribes exactly once
    - KOL messages route to `kolOrchestrator.onMessageReceived()`
    - News messages route to `storeNewsMessage.execute()`
    - `KolIngestionOrchestratorUseCase.onMessageReceived()` is public
    - No raw text in any domain event
  - **QA scenarios:** Integration test: mock both repos with active KOL + news channels → verify subscribe called once with both IDs. Verify KOL message goes to orchestrator. Verify news message goes to store-news. Verify fix-1: events carry no raw text.
  - **Commit:** `Y` | `feat(ingestion): add IngestionCoordinator for unified channel subscription and routing`

- [x] 7. Add env var config for crypto news seeding
  **What to do / Must NOT do:**
  - Add to `AppConfig` interface in `shared/common/config/app.config.ts`:
    ```typescript
    ingestion: {
      telegram: {
        // ... existing seed config
        newsSeed: {
          enabled: boolean;
          channels: SeedNewsChannelEntry[];
        };
      };
    };
    ```
  - Add `SeedNewsChannelEntry` interface (reuse pattern from `SeedKolEntry` but name independently)
  - Add `parseSeedNewsChannels()` function that reads `INGESTION_TELEGRAM_SEED_NEWS` env var (same format: `channelId|handle|title,...`)
  - Add config loading in the `registerAs` factory:
    ```typescript
    newsSeed: {
      enabled: (process.env.INGESTION_TELEGRAM_NEWS_SEED_ENABLED ?? 'true').toLowerCase() === 'true',
      channels: parseSeedNewsChannels(process.env.INGESTION_TELEGRAM_SEED_NEWS),
    }
    ```
  - Must NOT: rename or remove existing `seed` config keys
  - Must NOT: couple news config with KOL seed config
  - **Parallelization:** Wave 5 | Blocked by: T6 | Blocks: T8
  - **References:**
    - `apps/backend/src/shared/common/config/app.config.ts:19-23` — SeedKolEntry
    - `apps/backend/src/shared/common/config/app.config.ts:70-83` — existing seed config block
    - `apps/backend/src/shared/common/config/app.config.ts:149-176` — parseSeedKols function
    - `apps/backend/src/shared/common/config/app.config.ts:243-271` — ingestion config loading
  - **Acceptance criteria:**
    - AppConfig interface has `ingestion.telegram.newsSeed.enabled` and `.channels`
    - Env var `INGESTION_TELEGRAM_NEWS_SEED_ENABLED` controls seeding
    - Env var `INGESTION_TELEGRAM_SEED_NEWS` is parsed correctly
    - Backward compatible: existing INGESTION_TELEGRAM_SEED_KOLS unchanged
    - `npm run build` passes
  - **QA scenarios:** Unit test parseSeedNewsChannels with various inputs. Verify config loads from env. Verify default is enabled=true.
  - **Commit:** `Y` | `feat(config): add INGESTION_TELEGRAM_NEWS_SEED_ENABLED and SEED_NEWS env vars`

- [x] 8. Wire crypto-news module into app and register DB entities
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts`:
    - Provides all crypto-news providers (repos, use cases, seeder, event publisher)
    - Implements the repository provider factory (in-memory vs TypeORM) same pattern as IdentityModule
    - Imports `ConfigModule` for env access
  - Update `telegram/ingestion/telegram-ingestion.module.ts`:
    - Import `CryptoNewsIngestionModule`
    - Import `KolIngestionModule` (from T2)
    - Export from SharedIngestionModule: `IngestionCoordinator`
  - Register `CryptoNewsSourceEntity` and `CryptoNewsMessageEntity` in `shared/common/persistence/database.module.ts`:
    - Add to the `PERSISTED_ENTITIES` array
  - Must NOT: create circular imports between shared/ and crypto-news/
  - Must NOT: register entities in kol/identity's module
  - **Parallelization:** Wave 5 | Blocked by: T7 | Blocks: T9
  - **References:**
    - `apps/backend/src/telegram/ingestion/telegram-ingestion.module.ts:1-26` — current root module
    - `apps/backend/src/kol/identity/identity.module.ts:36` — TypeOrmModule.forFeature pattern
    - `apps/backend/src/shared/common/persistence/database.module.ts` — PERSISTED_ENTITIES
    - `apps/backend/src/kol/identity/identity.module.ts:45-61` — repository factory pattern (in-memory vs TypeORM)
  - **Acceptance criteria:**
    - `CryptoNewsIngestionModule` can be imported and resolves all providers
    - `telegram-ingestion.module.ts` imports all 3 sub-modules
    - DB entities are registered in TypeORM
    - No circular dependencies
    - `npm run build` passes
  - **QA scenarios:** Build passes. Verify DI resolution: inject CryptoNewsSourceRepository → resolves to correct implementation. Run with DATABASE_ENABLED=true → verify tables are created.
  - **Commit:** `Y` | `feat(crypto-news): wire crypto-news module and register DB entities`

- [x] 9. Create frontend page `/crypto-news` and backend API endpoint
  **What to do / Must NOT do:**
  - **Backend:**
    - Create `telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts`:
      - `GET /crypto-news/messages?limit=50` — returns recent news messages (from CryptoNewsMessageRepository)
      - `GET /crypto-news/sources` — returns all news sources
      - `POST /crypto-news/backfill/:channelId` — backfill historical news messages
    - Wire controller in `CryptoNewsIngestionModule`
  - **Frontend:**
    - Create `apps/frontend/src/pages/crypto-news/index.tsx` — page component showing news messages in a table/card layout
    - Create `apps/frontend/src/pages/crypto-news/columns.tsx` — table column definitions (if using shadcn/ui table)
    - Register route in `apps/frontend/src/app/App.tsx` or router file: `/crypto-news`
    - Add nav link in sidebar/header (in the existing layout)
    - Page layout: title "Crypto News", filter by source (dropdown), list of news cards with: source name, date, content preview
  - Must NOT: modify existing KOL pages or routes
  - Must NOT: add WebSocket real-time updates (future)
  - Must NOT: modify tailwind config or add new dependencies
  - **Parallelization:** Wave 6 | Blocked by: T8 | Blocks: T10
  - **References:**
    - `apps/backend/src/kol/identity/api/http/kol.controller.ts` — API controller pattern
    - `apps/frontend/src/app/index.tsx` — frontend router
    - `apps/frontend/src/pages/kols/index.tsx` — KOL page for pattern reference
    - `apps/frontend/src/widgets/` — widget pattern
  - **Acceptance criteria:**
    - `GET /crypto-news/messages` returns JSON array of news messages
    - `GET /crypto-news/sources` returns JSON array of news sources
    - Frontend page renders at `/crypto-news` with news messages
    - Nav link exists in the app header/sidebar
    - `npm run build` passes (both apps)
  - **QA scenarios:** Call GET /crypto-news/messages with seeded data → verify response. Navigate to /crypto-news in browser → verify page renders. Verify nav link exists.
  - **Commit:** `Y` | `feat(crypto-news): add backend API and frontend page for crypto news`

- [ ] 10. Tests for all new code
  **What to do / Must NOT do:**
  - Create `telegram/ingestion/crypto-news/domain/entities/__tests__/crypto-news-source.entity.spec.ts`:
    - Test creation with valid/invalid channel ID
    - Test activation/deactivation
    - Test recordMessageIngested
  - Create `telegram/ingestion/crypto-news/application/handlers/__tests__/register-news-source.use-case.spec.ts`:
    - Test successful registration
    - Test duplicate channel ID → CONFLICT
  - Create `telegram/ingestion/crypto-news/application/handlers/__tests__/store-news-message.use-case.spec.ts`:
    - Test storing a message
    - Test event published
  - Create `telegram/ingestion/shared/application/__tests__/ingestion-coordinator.service.spec.ts`:
    - Test coordinator subscribes once with all channels
    - Test KOL message routing
    - Test news message routing
    - Test fix-1 compliance (no raw text in events)
  - Update `kol/identity/application/handlers/__tests__/kol-ingestion-orchestrator.use-case.spec.ts` (if it exists):
    - Verify `onMessageReceived()` works
  - Must NOT: skip tests for core routing logic
  - Must NOT: mock TelegramListenerPort at integration level — unit tests use in-memory implementations only
  - **Parallelization:** Wave 7 | Blocked by: T3, T4, T5, T9 | Blocks: —
  - **References:**
    - `apps/backend/src/kol/identity/domain/entities/kol.entity.spec.ts` — domain entity test pattern
    - `apps/backend/src/kol/identity/application/handlers/__tests__/register-kol.use-case.spec.ts` — use case test pattern
  - **Acceptance criteria:**
    - All new files have co-located `*.spec.ts` tests
    - `npm run test:backend` passes with all new tests included
    - Coverage: at least 80% on new crypto-news BC
  - **QA scenarios:** Run full test suite. Verify all new tests pass. Verify no existing tests broken.
  - **Commit:** `Y` | `test(crypto-news): add tests for crypto-news domain, use cases, and coordinator`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. **Plan compliance audit** — Verify every todo in this plan was completed. Check scope boundaries: no channelType on kols, no pipeline changes, no WebSocket.
- [ ] F2. **Code quality review** — Run `npm run lint:backend`, `npm run build`, review for DDD violations (domain importing infra, entities in shared/, etc.)
- [ ] F3. **Real manual QA** — Start the app (`npm run dev:backend-only`), verify: (a) KOL seeds still register, (b) KOL messages still flow through pipeline, (c) Crypto news endpoint returns data, (d) Frontend page renders
- [ ] F4. **Scope fidelity** — Confirm NOT changed: Kol aggregate, pipeline BCs, existing KOL API/frontend pages

## Commit strategy
- Each todo = one conventional commit
- Type: `feat` for new functionality, `refactor` for moves, `test` for tests, `feat(config)` for config changes
- Scope: `(crypto-news)`, `(ingestion)`, or `(config)`
- No fixup/squash — commits should be clean and reviewable individually

## Success criteria
1. `telegram/ingestion/` has three sub-modules: `shared/`, `kol/`, `crypto-news/`
2. KOL seeds/seeder moved — `kol/identity/seeders/` no longer exists
3. `crypto_news_sources` and `crypto_news_messages` tables created automatically via TypeORM `synchronize: true`
4. `INGESTION_TELEGRAM_NEWS_SEED_ENABLED` controls news seeding independently
5. `CryptoNewsSeeder` registers news channels on boot (if enabled)
6. `IngestionCoordinator` subscribes once and routes messages correctly
7. `GET /crypto-news/messages` returns stored news
8. Frontend `/crypto-news` page renders with nav link
9. All existing KOL functionality completely unchanged
10. All new code has tests that pass
