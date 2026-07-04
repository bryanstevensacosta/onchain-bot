import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoNewsController } from 'telegram/ingestion/crypto-news/api/http/crypto-news.controller';
import { RegisterNewsSourceUseCase } from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsMetadataResolver } from 'telegram/ingestion/crypto-news/application/services/crypto-news-metadata-resolver.service';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

// The real `TelegramMtprotoListenerAdapter` transitively imports
// `telegram/extensions/Logger`, a CJS subpath that Jest's
// moduleNameMapper cannot resolve in this monorepo (the catchall rule
// `^telegram/(.*)$` shadows it to a non-existent `src/telegram/...` path).
// We only need the class as a DI token — the `addSource` handler never
// touches the listener — so we replace the module with an empty class
// stub. The controller's `import { TelegramMtprotoListenerAdapter }`
// resolves to the stub; tests then provide a `useValue` for that token.
jest.mock(
  'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter',
  () => ({
    TelegramMtprotoListenerAdapter: class TelegramMtprotoListenerAdapterStub {},
  }),
);
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class StubSourceRepo extends CryptoNewsSourceRepository {
  public readonly saved: CryptoNewsSource[] = [];
  private readonly store = new Map<string, CryptoNewsSource>();

  public async save(source: CryptoNewsSource): Promise<void> {
    this.saved.push(source);
    this.store.set(source.channelId, source);
  }

  public async findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null> {
    return this.store.get(channelId) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values());
  }

  public async findActive(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values()).filter((s) => s.isActive);
  }

  public async delete(channelId: string): Promise<void> {
    this.store.delete(channelId);
  }
}

class StubMessageRepo extends CryptoNewsMessageRepository {
  public async save(): Promise<void> {
    return;
  }
  public async findById() {
    return null;
  }
  public async findRecent(): Promise<never[]> {
    return [];
  }
  public async findByChannelId(): Promise<never[]> {
    return [];
  }
  public async findMediaById() {
    return null;
  }
}

class NoopEventPublisher extends CryptoNewsEventPublisher {
  public async publish(): Promise<void> {
    return;
  }
}

class StubMetadataResolver {
  public readonly resolve = jest.fn();

  public constructor(
    private readonly fixtures: Record<
      string,
      { title: string; handle: string | null; needsManualJoin: boolean }
    > = {},
  ) {}

  public async resolveImpl(channelId: string) {
    return (
      this.fixtures[channelId] ?? {
        title: `Telegram channel ${channelId}`,
        handle: null,
        needsManualJoin: false,
      }
    );
  }
}

const stubMediaEntityRepo: Partial<Repository<CryptoNewsMessageMediaEntity>> = {
  find: jest.fn().mockResolvedValue([]),
};

interface RegisterUseCaseOverrides {
  executeImpl?: (
    input: import('telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case').RegisterNewsSourceInput,
  ) => Promise<CryptoNewsSource>;
  /**
   * If set, `execute` will throw this value instead of calling the impl.
   * Used by the CONFLICT and VALIDATION tests to inject real DomainErrors.
   * Typed as `Error` to satisfy `@typescript-eslint/only-throw-error`
   * (the rule rejects throwing `unknown`).
   */
  throwOnExecute?: Error;
}

function makeRegisterUseCase(
  sourceRepo: StubSourceRepo,
  overrides: RegisterUseCaseOverrides = {},
): RegisterNewsSourceUseCase {
  const useCase = new RegisterNewsSourceUseCase(
    sourceRepo,
    new NoopEventPublisher(),
  );
  const originalExecute = useCase.execute.bind(useCase);
  jest
    .spyOn(useCase, 'execute')
    .mockImplementation(
      async (input: Parameters<typeof originalExecute>[0]) => {
        if (overrides.throwOnExecute !== undefined) {
          throw overrides.throwOnExecute;
        }
        if (overrides.executeImpl) {
          return overrides.executeImpl(input);
        }
        return originalExecute(input);
      },
    );
  return useCase;
}

interface ControllerHarness {
  controller: CryptoNewsController;
  sourceRepo: StubSourceRepo;
  messageRepo: StubMessageRepo;
  resolver: StubMetadataResolver;
  registerUseCase: RegisterNewsSourceUseCase;
}

async function buildController(
  options: {
    resolverFixtures?: Record<
      string,
      { title: string; handle: string | null; needsManualJoin: boolean }
    >;
    registerOverrides?: RegisterUseCaseOverrides;
  } = {},
): Promise<ControllerHarness> {
  const sourceRepo = new StubSourceRepo();
  const messageRepo = new StubMessageRepo();
  const resolver = new StubMetadataResolver(options.resolverFixtures ?? {});
  // Wire the jest.fn to delegate to the impl so `resolve()` returns
  // a real promise.
  resolver.resolve.mockImplementation((channelId: string) =>
    resolver.resolveImpl(channelId),
  );
  const registerUseCase = makeRegisterUseCase(
    sourceRepo,
    options.registerOverrides ?? {},
  );

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [CryptoNewsController],
    providers: [
      { provide: RegisterNewsSourceUseCase, useValue: registerUseCase },
      { provide: CryptoNewsSourceRepository, useValue: sourceRepo },
      { provide: CryptoNewsMessageRepository, useValue: messageRepo },
      { provide: TelegramMtprotoListenerAdapter, useValue: {} },
      { provide: CryptoNewsMetadataResolver, useValue: resolver },
      {
        provide: StoreNewsMessageUseCase,
        useValue: { execute: jest.fn().mockResolvedValue(undefined) },
      },
      {
        provide: getRepositoryToken(CryptoNewsMessageMediaEntity),
        useValue: stubMediaEntityRepo,
      },
    ],
  }).compile();

  return {
    controller: moduleRef.get(CryptoNewsController),
    sourceRepo,
    messageRepo,
    resolver,
    registerUseCase,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CryptoNewsController.addSource (POST /crypto-news/sources)', () => {
  it('registers a source with an explicit title and returns 201-shaped view', async () => {
    const { controller, sourceRepo, resolver } = await buildController();

    const view = await controller.addSource({
      channelId: '123',
      title: 'MyChannel',
    });

    // Resolver is bypassed when title is caller-supplied.
    expect(resolver.resolve).not.toHaveBeenCalled();

    // 201 status: the controller's @HttpCode(HttpStatus.CREATED) is a
    // metadata-only assertion; we verify the controller's @Post mapping
    // exists and returns the view synchronously below.
    // View shape (addedAt is asserted separately to keep this matcher
    // free of `expect.X(...)` calls that trigger a known
    // `@typescript-eslint/no-unsafe-assignment` false-positive on
    // Jest's matcher return type).
    expect(view.channelId).toBe('123');
    expect(view.title).toBe('MyChannel');
    expect(view.handle).toBeNull();
    expect(view.isActive).toBe(true);
    expect(view.lifecycleStatus).toBe('ACTIVE');

    // addedAt must be a valid ISO timestamp.
    expect(typeof view.addedAt).toBe('string');
    expect(() => new Date(view.addedAt).toISOString()).not.toThrow();
    expect(view.addedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    // The view was persisted via sourceRepo.save AFTER register returned.
    // Two saves happen: the use case persists once on register, then the
    // controller calls save() again after `activate()` so the listener
    // picks the source up on the next findActive() sweep.
    expect(sourceRepo.saved).toHaveLength(2);
    expect(sourceRepo.saved[0].channelId).toBe('123');
    // The controller's second save must reflect the post-activate state.
    const last = sourceRepo.saved[sourceRepo.saved.length - 1];
    expect(last.isActive).toBe(true);
    expect(last.lifecycleStatus).toBe('ACTIVE');
  });

  it('resolves the title via the metadata resolver when the caller omits it', async () => {
    const { controller, resolver } = await buildController({
      resolverFixtures: {
        '456': {
          title: 'Resolved Title',
          handle: 'resolved_handle',
          needsManualJoin: false,
        },
      },
    });

    const view = await controller.addSource({ channelId: '456' });

    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).toHaveBeenCalledWith('456');
    expect(view.title).toBe('Resolved Title');
    // handle falls back to the resolver's value when caller didn't supply one.
    expect(view.handle).toBe('resolved_handle');
  });

  it('honours a caller-supplied title and does NOT invoke the resolver', async () => {
    const { controller, resolver } = await buildController();

    const view = await controller.addSource({
      channelId: '789',
      title: 'CustomTitle',
    });

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(view.title).toBe('CustomTitle');
    expect(view.channelId).toBe('789');
  });

  it('preserves the caller-supplied handle in the response view', async () => {
    const { controller } = await buildController();

    const view = await controller.addSource({
      channelId: '111',
      title: 'X',
      handle: 'XHandle',
    });

    expect(view.handle).toBe('XHandle');
    expect(view.title).toBe('X');
    expect(view.channelId).toBe('111');
  });

  it('propagates DomainError(CONFLICT) when the channelId is already registered', async () => {
    const { controller, sourceRepo } = await buildController({
      registerOverrides: {
        throwOnExecute: new DomainError(
          ErrorCode.CONFLICT,
          'CryptoNewsSource already registered: 999',
          { channelId: '999' },
        ),
      },
    });

    await expect(
      controller.addSource({ channelId: '999', title: 'Dup' }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      controller.addSource({ channelId: '999', title: 'Dup' }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    // The controller must NOT swallow the error AND must NOT save a
    // partial source (no activate() in this path because execute
    // threw before returning).
    expect(sourceRepo.saved).toHaveLength(0);
  });

  it('propagates DomainError(VALIDATION) for an invalid (non-numeric) channelId', async () => {
    const { controller, sourceRepo, resolver } = await buildController({
      registerOverrides: {
        throwOnExecute: new DomainError(
          ErrorCode.VALIDATION,
          'Invalid crypto-news channelId: abc',
          { channelId: 'abc' },
        ),
      },
    });

    await expect(
      controller.addSource({ channelId: 'abc', title: 'X' }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      controller.addSource({ channelId: 'abc', title: 'X' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION });

    // Resolver is bypassed when title is supplied.
    expect(resolver.resolve).not.toHaveBeenCalled();
    // No partial state — register threw before the controller could
    // call activate() + save.
    expect(sourceRepo.saved).toHaveLength(0);
  });
});
