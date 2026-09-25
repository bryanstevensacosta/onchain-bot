import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DeduplicationModule } from 'shared/deduplication/deduplication.module';
import { ThreadsBlacklistController } from './api/http/blacklist.controller';
import { ThreadsKeywordsController } from './api/http/keywords.controller';
import { ThreadsLlmConfigController } from './api/http/llm-config.controller';
import { ThreadsPhrasesController } from './api/http/phrases.controller';
import { ThreadsQueueController } from './api/http/queue.controller';
import { ThreadsPublisherModule } from 'threads/publisher/threads-publisher.module';
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from 'threads/publisher/application/handlers/process-next-threads-article.use-case';
import { ThreadsApiPublisherPort } from 'threads/publisher/application/ports/threads-api-publisher.port';
import { ThreadsApiPublisherAdapter } from 'threads/publisher/infrastructure/senders/threads-api-publisher.adapter';

/**
 * No-op stand-in for the real `DeduplicationModule`.
 *
 * The publisher module imports it via `forwardRef` for parity with
 * the crypto-news mirror, but NO threads provider injects
 * `DeduplicationService` — so stubbing the module proves the real
 * threads graph without dragging the crypto publisher +
 * TypeORM-forFeature + onnx embedding graph into a unit spec.
 * (External dep only; every threads-internal provider stays real.)
 */
@Module({})
class StubDeduplicationModule {}

/**
 * Minimal stand-in for the app-wide global `ConfigModule`: the real
 * `ThreadsApiPublisherAdapter` ctor only calls
 * `configService.get('app')` (and logs a warn on empty threads
 * config — no crash). The per-module `LlmGatewayAdapter` override
 * builds a real OpenAI client at init, which demands a non-empty
 * `apiKey` (constructor-only, zero network), so the stub answers
 * `get('app')` with a dummy gateway block.
 */
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn((key: string) =>
          key === 'app'
            ? {
                llm: {
                  gateway: {
                    baseUrl: 'http://localhost:1',
                    apiKey: 'smoke-test-key',
                    model: 'smoke',
                  },
                },
              }
            : undefined,
        ),
      },
    },
    // The cron scheduler takes @InjectDataSource() for the advisory
    // lock (queried only at tick time, never at init) — a query stub
    // satisfies compile without a live Postgres.
    {
      provide: DataSource,
      useValue: { query: jest.fn().mockResolvedValue([]) },
    },
  ],
  exports: [ConfigService, DataSource],
})
class StubGlobalConfigModule {}

/**
 * DI smoke: the real `ThreadsPublisherModule` graph (adapter,
 * use-cases, schedulers, controllers, `LlmPort` override, throttle
 * bounds) compiles with only global-missing deps mocked.
 */
describe('ThreadsPublisherModule smoke (real providers)', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [StubGlobalConfigModule, ThreadsPublisherModule],
    })
      .overrideModule(DeduplicationModule)
      .useModule(StubDeduplicationModule)
      .compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('compiles the module', () => {
    expect(module).toBeDefined();
  });

  it('binds the REAL ThreadsApiPublisherAdapter (no stub)', () => {
    const publisher = module.get(ThreadsApiPublisherPort);
    expect(publisher).toBeInstanceOf(ThreadsApiPublisherAdapter);
  });

  it('instantiates the application use-cases', () => {
    expect(module.get(EnqueueThreadsMessageUseCase)).toBeInstanceOf(
      EnqueueThreadsMessageUseCase,
    );
    expect(module.get(ProcessNextThreadsArticleUseCase)).toBeInstanceOf(
      ProcessNextThreadsArticleUseCase,
    );
  });

  it('registers all 5 HTTP controllers', () => {
    expect(module.get(ThreadsKeywordsController)).toBeInstanceOf(
      ThreadsKeywordsController,
    );
    expect(module.get(ThreadsBlacklistController)).toBeInstanceOf(
      ThreadsBlacklistController,
    );
    expect(module.get(ThreadsPhrasesController)).toBeInstanceOf(
      ThreadsPhrasesController,
    );
    expect(module.get(ThreadsQueueController)).toBeInstanceOf(
      ThreadsQueueController,
    );
    expect(module.get(ThreadsLlmConfigController)).toBeInstanceOf(
      ThreadsLlmConfigController,
    );
  });
});

/**
 * `ThreadsIntegrationModule` boot is DEFERRED to the F3 dev-DB: it
 * registers `TypeOrmModule.forFeature([ThreadsMatchingConfigEntity])`
 * (plus the transitively DB-backed `CryptoNewsIngestionModule`), so
 * compiling it in isolation demands a live `DataSource` — there is
 * no reasonable `useValue` stub for that. Recorded in learnings;
 * only the publisher module is smoke-tested here.
 */
