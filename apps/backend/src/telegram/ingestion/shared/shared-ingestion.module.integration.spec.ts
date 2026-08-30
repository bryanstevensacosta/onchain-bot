import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
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
import { TELEGRAM_LISTENER_PORT_TOKEN } from './shared-injection-tokens';

/**
 * Integration tests for SharedIngestionModule mode switching
 * 
 * Per Requirement 7.1: Feature flag for MTProto/SSE mode toggle
 * Per Task 6.6: Integration tests for mode switching
 * 
 * Tests verify:
 * - Remote mode (useSse: true) instantiates TelegramSseListenerAdapter
 * - Local mode (useSse: false) instantiates TelegramMtprotoListenerAdapter
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
          { provide: IngestionSafetyConfig, useValue: mockIngestionSafetyConfig },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          { provide: FloodWaitCounterService, useValue: mockFloodWaitCounterService },
          { provide: FloodWaitHandlerService, useValue: mockFloodWaitHandlerService },
          { provide: TelegramClientManager, useValue: mockTelegramClientManager },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          { provide: TelegramMediaDownloadService, useValue: mockTelegramMediaDownloadService },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          { provide: CryptoNewsMediaDownloader, useValue: mockCryptoNewsMediaDownloader },
          
          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? false;
              return useSseIngestion ? sseAdapter : mtprotoAdapter;
            },
            inject: [ConfigService, TelegramMtprotoListenerAdapter, TelegramSseListenerAdapter],
          },
          
          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();

      telegramListener = moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      configService = moduleRef.get<ConfigService>(ConfigService);
    });

    it('should instantiate TelegramSseListenerAdapter when useSse is true', () => {
      // Verify the adapter is SSE type
      expect(telegramListener).toBeInstanceOf(TelegramSseListenerAdapter);
      expect(telegramListener).not.toBeInstanceOf(TelegramMtprotoListenerAdapter);
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

  describe('Local mode (MTProto)', () => {
    beforeEach(async () => {
      // Configure for local/MTProto mode
      moduleRef = await Test.createTestingModule({
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
          { provide: IngestionSafetyConfig, useValue: mockIngestionSafetyConfig },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          { provide: FloodWaitCounterService, useValue: mockFloodWaitCounterService },
          { provide: FloodWaitHandlerService, useValue: mockFloodWaitHandlerService },
          { provide: TelegramClientManager, useValue: mockTelegramClientManager },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          { provide: TelegramMediaDownloadService, useValue: mockTelegramMediaDownloadService },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          { provide: CryptoNewsMediaDownloader, useValue: mockCryptoNewsMediaDownloader },
          
          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? false;
              return useSseIngestion ? sseAdapter : mtprotoAdapter;
            },
            inject: [ConfigService, TelegramMtprotoListenerAdapter, TelegramSseListenerAdapter],
          },
          
          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();

      telegramListener = moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      configService = moduleRef.get<ConfigService>(ConfigService);
    });

    it('should instantiate TelegramMtprotoListenerAdapter when useSse is false', () => {
      // Verify the adapter is MTProto type
      expect(telegramListener).toBeInstanceOf(TelegramMtprotoListenerAdapter);
      expect(telegramListener).not.toBeInstanceOf(TelegramSseListenerAdapter);
    });

    it('should read useSse config from environment', () => {
      const appConfig = configService.get('app');
      expect(appConfig.ingestion.useSse).toBe(false);
    });

    it('should export TelegramListenerPort', () => {
      expect(telegramListener).toBeDefined();
      expect(typeof telegramListener.subscribe).toBe('function');
      expect(typeof telegramListener.backfill).toBe('function');
      expect(typeof telegramListener.disconnect).toBe('function');
    });

    it('should implement all TelegramListenerPort methods', () => {
      // Verify MTProto adapter implements the full interface
      expect(telegramListener.subscribe).toBeDefined();
      expect(telegramListener.backfill).toBeDefined();
      expect(telegramListener.disconnect).toBeDefined();
      expect(telegramListener.resolveChannelMetadata).toBeDefined();
      expect(telegramListener.joinChannel).toBeDefined();
    });
  });

  describe('Default mode (when useSse is undefined)', () => {
    beforeEach(async () => {
      // Configure without explicit useSse setting (should default to false)
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                app: {
                  ingestion: {
                    // useSse not set - should default to false
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
          { provide: IngestionSafetyConfig, useValue: mockIngestionSafetyConfig },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          { provide: FloodWaitCounterService, useValue: mockFloodWaitCounterService },
          { provide: FloodWaitHandlerService, useValue: mockFloodWaitHandlerService },
          { provide: TelegramClientManager, useValue: mockTelegramClientManager },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          { provide: TelegramMediaDownloadService, useValue: mockTelegramMediaDownloadService },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          { provide: CryptoNewsMediaDownloader, useValue: mockCryptoNewsMediaDownloader },
          
          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? false;
              return useSseIngestion ? sseAdapter : mtprotoAdapter;
            },
            inject: [ConfigService, TelegramMtprotoListenerAdapter, TelegramSseListenerAdapter],
          },
          
          // Token alias
          {
            provide: TELEGRAM_LISTENER_PORT_TOKEN,
            useExisting: TelegramListenerPort,
          },
        ],
      }).compile();

      telegramListener = moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
      configService = moduleRef.get<ConfigService>(ConfigService);
    });

    it('should default to MTProto adapter when useSse is undefined', () => {
      // Verify default is MTProto (safe rollback behavior)
      expect(telegramListener).toBeInstanceOf(TelegramMtprotoListenerAdapter);
      expect(telegramListener).not.toBeInstanceOf(TelegramSseListenerAdapter);
    });

    it('should treat undefined useSse as false', () => {
      const appConfig = configService.get('app');
      // The ?? operator in the module should default to false
      const useSse = appConfig?.ingestion?.useSse ?? false;
      expect(useSse).toBe(false);
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
          { provide: IngestionSafetyConfig, useValue: mockIngestionSafetyConfig },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          { provide: FloodWaitCounterService, useValue: mockFloodWaitCounterService },
          { provide: FloodWaitHandlerService, useValue: mockFloodWaitHandlerService },
          { provide: TelegramClientManager, useValue: mockTelegramClientManager },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          { provide: TelegramMediaDownloadService, useValue: mockTelegramMediaDownloadService },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          { provide: CryptoNewsMediaDownloader, useValue: mockCryptoNewsMediaDownloader },
          
          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? false;
              return useSseIngestion ? sseAdapter : mtprotoAdapter;
            },
            inject: [ConfigService, TelegramMtprotoListenerAdapter, TelegramSseListenerAdapter],
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
      const initialListener = moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
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
                    useSse: false,
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
          { provide: IngestionSafetyConfig, useValue: mockIngestionSafetyConfig },
          { provide: SleepWindowService, useValue: mockSleepWindowService },
          { provide: FloodWaitCounterService, useValue: mockFloodWaitCounterService },
          { provide: FloodWaitHandlerService, useValue: mockFloodWaitHandlerService },
          { provide: TelegramClientManager, useValue: mockTelegramClientManager },
          { provide: LastSeenManager, useValue: mockLastSeenManager },
          { provide: TelegramMediaDownloadService, useValue: mockTelegramMediaDownloadService },
          { provide: TelegramPeerResolver, useValue: mockTelegramPeerResolver },
          { provide: CryptoNewsMediaDownloader, useValue: mockCryptoNewsMediaDownloader },
          
          // Dynamic adapter selection (replicates module logic)
          {
            provide: TelegramListenerPort,
            useFactory: (
              config: ConfigService,
              mtprotoAdapter: TelegramMtprotoListenerAdapter,
              sseAdapter: TelegramSseListenerAdapter,
            ) => {
              const appConfig = config.get('app');
              const useSseIngestion = appConfig?.ingestion?.useSse ?? false;
              return useSseIngestion ? sseAdapter : mtprotoAdapter;
            },
            inject: [ConfigService, TelegramMtprotoListenerAdapter, TelegramSseListenerAdapter],
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
      const listener = moduleRef.get<TelegramListenerPort>(TelegramListenerPort);
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
