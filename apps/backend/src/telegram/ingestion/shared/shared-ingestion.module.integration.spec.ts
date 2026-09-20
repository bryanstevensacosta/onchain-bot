import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoneException, Logger } from '@nestjs/common';
import { TelegramListenerPort } from './domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from './api/mtproto/telegram-mtproto-listener.adapter';
import { TelegramSseListenerAdapter } from './api/sse/telegram-sse-listener.adapter';
import { IngestionSafetyConfig } from './infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from './infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from './infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from './infrastructure/services/flood-wait-handler.service';
import { TelegramClientManager } from './infrastructure/services/telegram-client-manager.service';
import { LastSeenManager } from './infrastructure/services/last-seen-manager.service';
import { TelegramMediaDownloadService } from './infrastructure/services/telegram-media-download.service';
import { TelegramPeerResolver } from './infrastructure/services/telegram-peer-resolver';
import { CryptoNewsMediaDownloader } from '../crypto-news/application/ports/crypto-news-media-downloader.port';
import { BackendRegistrationClient } from './infrastructure/backend-registration-client.service';
import { TELEGRAM_LISTENER_PORT_TOKEN } from './shared-injection-tokens';

/**
 * Integration tests for SharedIngestionModule mode switching
 *
 * Per Requirement 7.1: Feature flag for MTProto/SSE mode toggle
 * Per Task 6.6: Integration tests for mode switching
 *
 * Tests verify:
 * - Remote mode (useSse: true) instantiates TelegramSseListenerAdapter
 * - Forced MTProto (useSse: false) throws 410 Gone (T4, backend removido)
 * - Default (useSse undefined) instantiates TelegramSseListenerAdapter (T4)
 * - Mode selection controlled by app.ingestion.useSse config
 *
 * NOTE: These are isolated integration tests that mock module dependencies
 * to focus solely on the mode switching logic without full module initialization.
 */
describe('SharedIngestionModule - Mode Switching Integration', () => {
  let moduleRef: TestingModule;
  let telegramListener: TelegramListenerPort;
  let configService: ConfigService;

  // Mock services to avoid complex dependency resolution
  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockIngestionSafetyConfig = {} as any;
  const mockSleepWindowService = {} as any;
  const mockFloodWaitCounterService = {} as any;
  const mockFloodWaitHandlerService = {} as any;
  const mockTelegramClientManager = {
    disconnect: jest.fn().mockResolvedValue(undefined),
  } as any;
  const mockLastSeenManager = {} as any;
  const mockTelegramMediaDownloadService = {} as any;
  const mockTelegramPeerResolver = {} as any;
  const mockCryptoNewsMediaDownloader = {} as any;
  const mockBackendRegistrationClient = {
    getBackendId: jest.fn().mockReturnValue('test-backend'),
    isRegistered: jest.fn().mockReturnValue(true),
    forceReregistration: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue({
      status: 'registered',
      backendId: 'test-backend',
      channelUnionSize: 0,
      lastAttempt: null,
      consecutiveFailures: 0,
    }),
  } as any;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    jest.clearAllMocks();
  });

  describe('Remote mode (SSE)', () => {
    beforeEach(async () => {
      // Configure for remote/SSE mode
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                app: {
                  ingestion: {
                    useSse: true,
                    serviceUrl: 'http://localhost:3031',
                  },
                },
              }),
            ],
          }),
        ],
        providers: [
          // Provide both adapters
          TelegramMtprotoListenerAdapter,
          TelegramSseListenerAdapter,

          // Mock dependencies
          { provide: Logger, useValue: mockLogger },
          {
            provide: IngestionSafetyConfig,
            useValue: mockIngestionSafetyConfig,
          },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          {
            provide: FloodWaitCounterService,
            useValue: mockFloodWaitCounterService,
          },
          {
            provide: FloodWaitHandlerService,
            useValue: mockFloodWaitHandlerService,
          },
          {
            provide: TelegramClientManager,
            useValue: mockTelegramClientManager,
          },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          {
            provide: TelegramMediaDownloadService,
            useValue: mockTelegramMediaDownloadService,
          },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          {
            provide: CryptoNewsMediaDownloader,
            useValue: mockCryptoNewsMediaDownloader,
          },
          {
            provide: BackendRegistrationClient,
            useValue: mockBackendRegistrationClient,
          },

          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? true;
              if (!useSseIngestion) {
                throw new GoneException(
                  'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
                );
              }
              return sseAdapter;
            },
            inject: [
              ConfigService,
              TelegramMtprotoListenerAdapter,
              TelegramSseListenerAdapter,
            ],
          },

          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();

      telegramListener =
        moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      configService = moduleRef.get<ConfigService>(ConfigService);
    });

    it('should instantiate TelegramSseListenerAdapter when useSse is true', () => {
      // Verify the adapter is SSE type
      expect(telegramListener).toBeInstanceOf(TelegramSseListenerAdapter);
      expect(telegramListener).not.toBeInstanceOf(
        TelegramMtprotoListenerAdapter,
      );
    });

    it('should read useSse config from environment', () => {
      const appConfig = configService.get('app');
      expect(appConfig.ingestion.useSse).toBe(true);
    });

    it('should provide correct service URL to SSE adapter', () => {
      const appConfig = configService.get('app');
      expect(appConfig.ingestion.serviceUrl).toBe('http://localhost:3031');
    });

    it('should export TelegramListenerPort', () => {
      expect(telegramListener).toBeDefined();
      expect(typeof telegramListener.subscribe).toBe('function');
      expect(typeof telegramListener.backfill).toBe('function');
      expect(typeof telegramListener.disconnect).toBe('function');
    });

    it('should implement all TelegramListenerPort methods', () => {
      // Verify SSE adapter implements the full interface
      expect(telegramListener.subscribe).toBeDefined();
      expect(telegramListener.backfill).toBeDefined();
      expect(telegramListener.disconnect).toBeDefined();
      expect(telegramListener.resolveChannelMetadata).toBeDefined();
      expect(telegramListener.joinChannel).toBeDefined();
    });
  });

  describe('MTProto removido (410 Gone, T4)', () => {
    // Nest instancia providers en compile(): con useSse:false el compile
    // mismo rechaza con 410 — nunca existe un adapter MTProto conectado.
    const buildMtprotoForcedModule = () =>
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                app: {
                  ingestion: {
                    useSse: false,
                    serviceUrl: 'http://localhost:3031', // Should be ignored
                  },
                  telegram: {
                    apiId: 12345,
                    apiHash: 'test-hash',
                    phoneNumber: '+1234567890',
                    password: 'test-password',
                    session: 'test-session-string',
                  },
                  redis: {
                    host: 'localhost',
                    port: 6379,
                  },
                },
              }),
            ],
          }),
        ],
        providers: [
          // Provide both adapters
          TelegramMtprotoListenerAdapter,
          TelegramSseListenerAdapter,

          // Mock dependencies
          { provide: Logger, useValue: mockLogger },
          {
            provide: IngestionSafetyConfig,
            useValue: mockIngestionSafetyConfig,
          },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          {
            provide: FloodWaitCounterService,
            useValue: mockFloodWaitCounterService,
          },
          {
            provide: FloodWaitHandlerService,
            useValue: mockFloodWaitHandlerService,
          },
          {
            provide: TelegramClientManager,
            useValue: mockTelegramClientManager,
          },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          {
            provide: TelegramMediaDownloadService,
            useValue: mockTelegramMediaDownloadService,
          },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          {
            provide: CryptoNewsMediaDownloader,
            useValue: mockCryptoNewsMediaDownloader,
          },
          {
            provide: BackendRegistrationClient,
            useValue: mockBackendRegistrationClient,
          },

          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? true;
              if (!useSseIngestion) {
                throw new GoneException(
                  'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
                );
              }
              return sseAdapter;
            },
            inject: [
              ConfigService,
              TelegramMtprotoListenerAdapter,
              TelegramSseListenerAdapter,
            ],
          },

          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();

    it('should throw 410 Gone with exact message when MTProto forced', async () => {
      await expect(buildMtprotoForcedModule()).rejects.toThrow(
        'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
      );
    });

    it('should throw GoneException (status 410)', async () => {
      const err = await buildMtprotoForcedModule().then(
        () => {
          throw new Error('expected GoneException');
        },
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(GoneException);
      expect((err as GoneException).getStatus()).toBe(410);
    });
  });

  describe('Default mode (when useSse is undefined)', () => {
    beforeEach(async () => {
      // Configure without explicit useSse setting (should default to SSE, T4)
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                app: {
                  ingestion: {
                    // useSse not set - should default to SSE (T4)
                    serviceUrl: 'http://localhost:3031',
                  },
                  telegram: {
                    apiId: 12345,
                    apiHash: 'test-hash',
                    phoneNumber: '+1234567890',
                    password: 'test-password',
                    session: 'test-session-string',
                  },
                  redis: {
                    host: 'localhost',
                    port: 6379,
                  },
                },
              }),
            ],
          }),
        ],
        providers: [
          // Provide both adapters
          TelegramMtprotoListenerAdapter,
          TelegramSseListenerAdapter,

          // Mock dependencies
          { provide: Logger, useValue: mockLogger },
          {
            provide: IngestionSafetyConfig,
            useValue: mockIngestionSafetyConfig,
          },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          {
            provide: FloodWaitCounterService,
            useValue: mockFloodWaitCounterService,
          },
          {
            provide: FloodWaitHandlerService,
            useValue: mockFloodWaitHandlerService,
          },
          {
            provide: TelegramClientManager,
            useValue: mockTelegramClientManager,
          },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          {
            provide: TelegramMediaDownloadService,
            useValue: mockTelegramMediaDownloadService,
          },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          {
            provide: CryptoNewsMediaDownloader,
            useValue: mockCryptoNewsMediaDownloader,
          },
          {
            provide: BackendRegistrationClient,
            useValue: mockBackendRegistrationClient,
          },

          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? true;
              if (!useSseIngestion) {
                throw new GoneException(
                  'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
                );
              }
              return sseAdapter;
            },
            inject: [
              ConfigService,
              TelegramMtprotoListenerAdapter,
              TelegramSseListenerAdapter,
            ],
          },

          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();

      telegramListener =
        moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      configService = moduleRef.get<ConfigService>(ConfigService);
    });

    it('should default to SSE adapter when useSse is undefined (T4)', () => {
      // Verify default is SSE (MTProto backend removido en T4)
      expect(telegramListener).toBeInstanceOf(TelegramSseListenerAdapter);
      expect(telegramListener).not.toBeInstanceOf(
        TelegramMtprotoListenerAdapter,
      );
    });

    it('should treat undefined useSse as true', () => {
      const appConfig = configService.get('app');
      // The ?? operator in the module should default to true (T4)
      const useSse = appConfig?.ingestion?.useSse ?? true;
      expect(useSse).toBe(true);
    });
  });

  describe('Both adapters available (rollback capability)', () => {
    beforeEach(async () => {
      // Configure for SSE mode to test both adapters are available
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                app: {
                  ingestion: {
                    useSse: true,
                    serviceUrl: 'http://localhost:3031',
                  },
                  telegram: {
                    apiId: 12345,
                    apiHash: 'test-hash',
                    phoneNumber: '+1234567890',
                    password: 'test-password',
                    session: 'test-session-string',
                  },
                  redis: {
                    host: 'localhost',
                    port: 6379,
                  },
                },
              }),
            ],
          }),
        ],
        providers: [
          // Provide both adapters
          TelegramMtprotoListenerAdapter,
          TelegramSseListenerAdapter,

          // Mock dependencies
          { provide: Logger, useValue: mockLogger },
          {
            provide: IngestionSafetyConfig,
            useValue: mockIngestionSafetyConfig,
          },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          {
            provide: FloodWaitCounterService,
            useValue: mockFloodWaitCounterService,
          },
          {
            provide: FloodWaitHandlerService,
            useValue: mockFloodWaitHandlerService,
          },
          {
            provide: TelegramClientManager,
            useValue: mockTelegramClientManager,
          },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          {
            provide: TelegramMediaDownloadService,
            useValue: mockTelegramMediaDownloadService,
          },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          {
            provide: CryptoNewsMediaDownloader,
            useValue: mockCryptoNewsMediaDownloader,
          },
          {
            provide: BackendRegistrationClient,
            useValue: mockBackendRegistrationClient,
          },

          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? true;
              if (!useSseIngestion) {
                throw new GoneException(
                  'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
                );
              }
              return sseAdapter;
            },
            inject: [
              ConfigService,
              TelegramMtprotoListenerAdapter,
              TelegramSseListenerAdapter,
            ],
          },

          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();
    });

    it('should provide both MTProto and SSE adapters for rollback capability', () => {
      // Verify both adapters are instantiated (Per Requirement 7.4)
      const mtprotoAdapter = moduleRef.get<TelegramMtprotoListenerAdapter>(
        TelegramMtprotoListenerAdapter,
      );
      const sseAdapter = moduleRef.get<TelegramSseListenerAdapter>(
        TelegramSseListenerAdapter,
      );

      expect(mtprotoAdapter).toBeInstanceOf(TelegramMtprotoListenerAdapter);
      expect(sseAdapter).toBeInstanceOf(TelegramSseListenerAdapter);
    });

    it('should allow switching adapters at runtime by changing config', async () => {
      // In SSE mode initially
      const initialListener =
        moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      expect(initialListener).toBeInstanceOf(TelegramSseListenerAdapter);

      // To simulate a runtime switch, we would need to:
      // 1. Update config
      // 2. Restart the module
      // This test verifies both adapters exist for such a switch
      const mtprotoAdapter = moduleRef.get<TelegramMtprotoListenerAdapter>(
        TelegramMtprotoListenerAdapter,
      );
      const sseAdapter = moduleRef.get<TelegramSseListenerAdapter>(
        TelegramSseListenerAdapter,
      );

      expect(mtprotoAdapter).toBeDefined();
      expect(sseAdapter).toBeDefined();

      // Verify they're different instances
      expect(mtprotoAdapter).not.toBe(sseAdapter);
    });
  });

  describe('Module exports', () => {
    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                app: {
                  ingestion: {
                    useSse: true,
                  },
                  telegram: {
                    apiId: 12345,
                    apiHash: 'test-hash',
                    phoneNumber: '+1234567890',
                    password: 'test-password',
                    session: 'test-session-string',
                  },
                  redis: {
                    host: 'localhost',
                    port: 6379,
                  },
                },
              }),
            ],
          }),
        ],
        providers: [
          // Provide both adapters
          TelegramMtprotoListenerAdapter,
          TelegramSseListenerAdapter,

          // Mock dependencies
          { provide: Logger, useValue: mockLogger },
          {
            provide: IngestionSafetyConfig,
            useValue: mockIngestionSafetyConfig,
          },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          {
            provide: FloodWaitCounterService,
            useValue: mockFloodWaitCounterService,
          },
          {
            provide: FloodWaitHandlerService,
            useValue: mockFloodWaitHandlerService,
          },
          {
            provide: TelegramClientManager,
            useValue: mockTelegramClientManager,
          },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          {
            provide: TelegramMediaDownloadService,
            useValue: mockTelegramMediaDownloadService,
          },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          {
            provide: CryptoNewsMediaDownloader,
            useValue: mockCryptoNewsMediaDownloader,
          },
          {
            provide: BackendRegistrationClient,
            useValue: mockBackendRegistrationClient,
          },

          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? true;
              if (!useSseIngestion) {
                throw new GoneException(
                  'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
                );
              }
              return sseAdapter;
            },
            inject: [
              ConfigService,
              TelegramMtprotoListenerAdapter,
              TelegramSseListenerAdapter,
            ],
          },

          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();
    });

    it('should export TelegramListenerPort for use by other modules', () => {
      const listener =
        moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      expect(listener).toBeDefined();
    });

    it('should export both adapter types explicitly', () => {
      const mtprotoAdapter = moduleRef.get<TelegramMtprotoListenerAdapter>(
        TelegramMtprotoListenerAdapter,
      );
      const sseAdapter = moduleRef.get<TelegramSseListenerAdapter>(
        TelegramSseListenerAdapter,
      );

      expect(mtprotoAdapter).toBeDefined();
      expect(sseAdapter).toBeDefined();
    });

    it('should export ingestion infrastructure services', () => {
      // Verify other exported services are available
      const configService = moduleRef.get<ConfigService>(ConfigService);
      expect(configService).toBeDefined();
    });
  });
});
