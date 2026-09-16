import { BadRequestException, RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ThreadsBlacklistController } from './blacklist.controller';
import { ThreadsKeywordsController } from './keywords.controller';
import { ThreadsLlmConfigController } from './llm-config.controller';
import { ThreadsPhrasesController } from './phrases.controller';
import { ThreadsQueueController } from './queue.controller';
import { ThreadsPublisherModule } from 'threads/publisher/threads-publisher.module';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import { ThreadsPromptTemplateRepository } from 'threads/publisher/application/ports/threads-prompt-template.repository';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';
import { GetThreadsLlmModelsUseCase } from 'threads/publisher/application/handlers/get-threads-llm-models.use-case';
import { InMemoryThreadsBlacklistPhraseRepository } from 'threads/publisher/application/repositories/in-memory-threads-blacklist-phrase.repository';
import { InMemoryThreadsKeywordRepository } from 'threads/publisher/application/repositories/in-memory-threads-keyword.repository';
import { InMemoryThreadsLlmConfigRepository } from 'threads/publisher/application/repositories/in-memory-threads-llm-config.repository';
import { InMemoryThreadsPromptTemplateRepository } from 'threads/publisher/application/repositories/in-memory-threads-prompt-template.repository';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import { ThreadsPhraseRegistryService } from 'threads/publisher/application/services/threads-phrase-registry.service';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';

type ControllerClass = new (...args: never[]) => object;

const controllerPathOf = (controller: ControllerClass): unknown =>
  Reflect.getMetadata(PATH_METADATA, controller);

interface RouteProbe {
  readonly controller: ControllerClass;
  readonly method: string;
  readonly httpMethod: RequestMethod;
  readonly path: string;
}

const routeOf = (controller: ControllerClass, method: string): RouteProbe => {
  const target = controller.prototype as Record<string, (...args: never[]) => unknown>;
  const handler = target[method];
  return {
    controller,
    method,
    httpMethod: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string,
  };
};

describe('ThreadsPublisher HTTP routes (T4)', () => {
  let module: TestingModule;
  let keywords: ThreadsKeywordsController;
  let blacklist: ThreadsBlacklistController;
  let phrases: ThreadsPhrasesController;
  let queue: ThreadsQueueController;
  let llm: ThreadsLlmConfigController;
  let queueRepo: ThreadsQueueRepository;
  let llmConfigRepo: InMemoryThreadsLlmConfigRepository;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [
        ThreadsKeywordsController,
        ThreadsBlacklistController,
        ThreadsPhrasesController,
        ThreadsQueueController,
        ThreadsLlmConfigController,
      ],
      providers: [
        InMemoryThreadsKeywordRepository,
        InMemoryThreadsBlacklistPhraseRepository,
        InMemoryThreadsPromptTemplateRepository,
        InMemoryThreadsQueueRepository,
        InMemoryThreadsLlmConfigRepository,
        ThreadsPhraseRegistryService,
        GetThreadsLlmModelsUseCase,
        {
          provide: ThreadsKeywordRepository,
          useClass: InMemoryThreadsKeywordRepository,
        },
        {
          provide: ThreadsBlacklistPhraseRepository,
          useClass: InMemoryThreadsBlacklistPhraseRepository,
        },
        {
          provide: ThreadsPromptTemplateRepository,
          useClass: InMemoryThreadsPromptTemplateRepository,
        },
        {
          provide: ThreadsQueueRepository,
          useClass: InMemoryThreadsQueueRepository,
        },
        {
          provide: ThreadsLlmConfigRepository,
          useClass: InMemoryThreadsLlmConfigRepository,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    keywords = module.get(ThreadsKeywordsController);
    blacklist = module.get(ThreadsBlacklistController);
    phrases = module.get(ThreadsPhrasesController);
    queue = module.get(ThreadsQueueController);
    llm = module.get(ThreadsLlmConfigController);
    queueRepo = module.get(ThreadsQueueRepository);
    llmConfigRepo = module.get(ThreadsLlmConfigRepository);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('route registration', () => {
    it.each([
      [ThreadsKeywordsController, 'threads-publisher/keywords'],
      [ThreadsBlacklistController, 'threads-publisher/blacklist'],
      [ThreadsPhrasesController, 'threads-publisher/phrases'],
      [ThreadsQueueController, 'threads-publisher/queue'],
      [ThreadsLlmConfigController, 'threads-publisher/llm'],
    ] as Array<[ControllerClass, string]>)(
      'registers %p with exact prefix %s',
      (controller, prefix) => {
        expect(controllerPathOf(controller)).toBe(prefix);
      },
    );

    it('never uses crypto-news-* or bare /threads prefixes', () => {
      const controllers = [
        ThreadsKeywordsController,
        ThreadsBlacklistController,
        ThreadsPhrasesController,
        ThreadsQueueController,
        ThreadsLlmConfigController,
      ];
      for (const controller of controllers) {
        const prefix = String(controllerPathOf(controller));
        expect(prefix).not.toContain('crypto-news');
        expect(prefix).not.toBe('threads');
        expect(prefix.startsWith('threads-publisher/')).toBe(true);
      }
    });

    it('exposes the pinned method routes', () => {
      const expected: RouteProbe[] = [
        // keywords CRUD + batch
        { controller: ThreadsKeywordsController, method: 'list', httpMethod: RequestMethod.GET, path: '/' },
        { controller: ThreadsKeywordsController, method: 'getOne', httpMethod: RequestMethod.GET, path: ':id' },
        { controller: ThreadsKeywordsController, method: 'create', httpMethod: RequestMethod.POST, path: '/' },
        { controller: ThreadsKeywordsController, method: 'createBatch', httpMethod: RequestMethod.POST, path: 'batch' },
        { controller: ThreadsKeywordsController, method: 'update', httpMethod: RequestMethod.PATCH, path: ':id' },
        { controller: ThreadsKeywordsController, method: 'remove', httpMethod: RequestMethod.DELETE, path: ':id' },
        // blacklist CRUD + batch
        { controller: ThreadsBlacklistController, method: 'list', httpMethod: RequestMethod.GET, path: '/' },
        { controller: ThreadsBlacklistController, method: 'create', httpMethod: RequestMethod.POST, path: '/' },
        { controller: ThreadsBlacklistController, method: 'createBatch', httpMethod: RequestMethod.POST, path: 'batch' },
        { controller: ThreadsBlacklistController, method: 'remove', httpMethod: RequestMethod.DELETE, path: ':id' },
        // phrases search + conflict-check
        { controller: ThreadsPhrasesController, method: 'list', httpMethod: RequestMethod.GET, path: '/' },
        { controller: ThreadsPhrasesController, method: 'search', httpMethod: RequestMethod.GET, path: 'search' },
        { controller: ThreadsPhrasesController, method: 'conflictCheck', httpMethod: RequestMethod.GET, path: 'conflict-check' },
        // queue list + counts + cancel
        { controller: ThreadsQueueController, method: 'list', httpMethod: RequestMethod.GET, path: '/' },
        { controller: ThreadsQueueController, method: 'counts', httpMethod: RequestMethod.GET, path: 'counts' },
        { controller: ThreadsQueueController, method: 'remove', httpMethod: RequestMethod.DELETE, path: ':id' },
        // llm config + models + templates CRUD
        { controller: ThreadsLlmConfigController, method: 'listModels', httpMethod: RequestMethod.GET, path: 'models' },
        { controller: ThreadsLlmConfigController, method: 'listTemplates', httpMethod: RequestMethod.GET, path: 'templates' },
        { controller: ThreadsLlmConfigController, method: 'getTemplate', httpMethod: RequestMethod.GET, path: 'templates/:id' },
        { controller: ThreadsLlmConfigController, method: 'createTemplate', httpMethod: RequestMethod.POST, path: 'templates' },
        { controller: ThreadsLlmConfigController, method: 'updateTemplate', httpMethod: RequestMethod.PATCH, path: 'templates/:id' },
        { controller: ThreadsLlmConfigController, method: 'deleteTemplate', httpMethod: RequestMethod.DELETE, path: 'templates/:id' },
        { controller: ThreadsLlmConfigController, method: 'getConfig', httpMethod: RequestMethod.GET, path: 'config' },
        { controller: ThreadsLlmConfigController, method: 'updateConfig', httpMethod: RequestMethod.PATCH, path: 'config' },
      ];
      for (const { controller, method, httpMethod, path } of expected) {
        expect(routeOf(controller, method)).toMatchObject({
          controller,
          method,
          httpMethod,
          path,
        });
      }
    });

    it('wires all 5 controllers into ThreadsPublisherModule', () => {
      const wired = Reflect.getMetadata(
        'controllers',
        ThreadsPublisherModule,
      ) as unknown[];
      expect(wired).toEqual(
        expect.arrayContaining([
          ThreadsKeywordsController,
          ThreadsBlacklistController,
          ThreadsPhrasesController,
          ThreadsQueueController,
          ThreadsLlmConfigController,
        ]),
      );
    });
  });

  describe('keyword CRUD roundtrip', () => {
    it('create → list → getOne → update → remove', async () => {
      const created = await keywords.create({ phrase: 'ETF' });
      expect(created.phrase).toBe('ETF');

      const listed = await keywords.list();
      expect(listed.map((k) => k.id)).toContain(created.id);

      const one = await keywords.getOne(created.id);
      expect(one.phrase).toBe('ETF');

      const updated = await keywords.update(created.id, { enabled: false });
      expect(updated.enabled).toBe(false);

      await keywords.remove(created.id);
      const after = await keywords.list();
      expect(after.map((k) => k.id)).not.toContain(created.id);
    });
  });

  describe('queue cancel happy path', () => {
    it('PENDING entry is listed, counted, then deleted', async () => {
      await queueRepo.enqueue(
        ThreadsQueueEntry.create({
          channelId: '-100123',
          messageId: 456,
          rawContent: 'markets rally on ETF news',
          rawTitle: null,
          groupedId: null,
          messageReceivedAt: new Date(),
        }),
      );

      const listed = await queue.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.status).toBe('PENDING');

      const counts = await queue.counts();
      expect(counts.pending).toBe(1);
      expect(counts.dailyCap).toBe(60);

      const id = listed[0]?.id ?? '';
      await queue.remove(id);

      const after = await queue.list();
      expect(after).toHaveLength(0);
      expect((await queue.counts()).pending).toBe(0);
    });
  });

  describe('llm config prod guard', () => {
    const previousEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = previousEnv;
    });

    it('PATCH config with llmEnabled → 400 in production', async () => {
      process.env.NODE_ENV = 'production';
      await expect(llm.updateConfig({ llmEnabled: false })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('PATCH config with llmEnabled → 200 in dev', async () => {
      process.env.NODE_ENV = 'development';
      const view = await llm.updateConfig({ llmEnabled: true });
      expect(view.llmEnabled).toBe(true);
      // restore seed default for other specs in this file
      await llm.updateConfig({ llmEnabled: false });
      expect(llmConfigRepo).toBeDefined();
    });

    it('PATCH config with publishingEnabled → 200 even in production', async () => {
      process.env.NODE_ENV = 'production';
      const view = await llm.updateConfig({ publishingEnabled: true });
      expect(view.publishingEnabled).toBe(true);
      await llm.updateConfig({ publishingEnabled: false });
    });

    it('smuggled matchingEnabled → 400 with hint in any env', async () => {
      process.env.NODE_ENV = 'development';
      await expect(
        llm.updateConfig({ matchingEnabled: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('phrases + blacklist smoke', () => {
    it('blacklist create → phrases list → search → conflict-check', async () => {
      await blacklist.create({ phrase: 'giveaway' });
      const all = await phrases.list();
      expect(all.map((p) => p.phrase)).toContain('giveaway');

      const found = await phrases.search('give');
      expect(found.map((p) => p.phrase)).toContain('giveaway');

      const conflict = await phrases.conflictCheck('giveaway');
      expect(conflict.exists).toBe(true);
      expect(conflict.asBlacklist).toBe(true);
    });
  });
});
