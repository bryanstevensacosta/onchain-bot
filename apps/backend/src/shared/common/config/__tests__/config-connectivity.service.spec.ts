import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../app.config';
import { ConfigConnectivityService } from '../config-connectivity.service';

// Mock pg Client
const mockPgConnect = jest.fn();
const mockPgQuery = jest.fn();
const mockPgEnd = jest.fn();

jest.mock('pg', () => {
  return {
    __esModule: true,
    Client: jest.fn().mockImplementation(() => ({
      connect: mockPgConnect,
      query: mockPgQuery,
      end: mockPgEnd,
    })),
  };
});

// Mock ioredis
const mockRedisConnect = jest.fn();
const mockRedisPing = jest.fn();
const mockRedisDisconnect = jest.fn();

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    Redis: jest.fn().mockImplementation(() => ({
      connect: mockRedisConnect,
      ping: mockRedisPing,
      disconnect: mockRedisDisconnect,
    })),
  };
});

// Mock Logger
const mockLoggerLog = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('@nestjs/common', () => {
  const actual: Record<string, unknown> = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Logger: jest.fn().mockImplementation(() => ({
      log: mockLoggerLog,
      warn: mockLoggerWarn,
      debug: mockLoggerDebug,
    })),
  };
});

// Import mocks after jest.mock
import { Client } from 'pg';
import { Redis } from 'ioredis';

const mockedClient = Client as jest.MockedClass<typeof Client>;
const mockedRedis = Redis as jest.MockedClass<typeof Redis>;

interface MockAppConfig extends AppConfig {
  database: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  redis: {
    enabled: boolean;
    host: string;
    port: number;
    password: string;
    db: number;
  };
  telegram: {
    botToken: string;
    mtprotoApiId: number;
    mtprotoApiHash: string;
    mtprotoSession: string;
  };
  publishing: {
    vipCalls: { botToken: string };
    cryptoNews: { botToken: string };
    chainDexterBot: { botToken: string };
  };
}

function createMockConfigService(
  config: Partial<MockAppConfig> | null,
): ConfigService {
  return {
    get: jest.fn().mockReturnValue(config),
  } as unknown as ConfigService;
}

describe('ConfigConnectivityService', () => {
  let service: ConfigConnectivityService;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Reset module mocks
    mockedClient.mockClear();
    mockedRedis.mockClear();
  });

  describe('checkPostgres', () => {
    it('DB ping succeeds → logger.log called with OK message, no warning', async () => {
      const mockClientInstance = {
        connect: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue({ rows: [] }),
        end: jest.fn().mockResolvedValue(undefined),
      };

      mockedClient.mockImplementation(() => mockClientInstance as any);

      const config = createMockConfigService({
        database: {
          enabled: true,
          host: 'localhost',
          port: 5432,
          username: 'user',
          password: 'pass',
          database: 'testdb',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockClientInstance.connect).toHaveBeenCalled();
      expect(mockClientInstance.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockLoggerLog).toHaveBeenCalledWith(
        'Postgres connectivity check: OK',
      );
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('DB ping fails (Client throws) → logger.warn called with error message', async () => {
      const mockClientInstance = {
        connect: jest.fn().mockRejectedValue(new Error('Connection refused')),
        query: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined),
      };

      mockedClient.mockImplementation(() => mockClientInstance as any);

      const config = createMockConfigService({
        database: {
          enabled: true,
          host: 'localhost',
          port: 5432,
          username: 'user',
          password: 'pass',
          database: 'testdb',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Postgres unreachable: Connection refused',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();
    });

    it('DB disabled (database.enabled=false) → no pg client created, no logs (or just trace)', async () => {
      const config = createMockConfigService({
        database: {
          enabled: false,
          host: 'localhost',
          port: 5432,
          username: 'user',
          password: 'pass',
          database: 'testdb',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockedClient).not.toHaveBeenCalled();
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Postgres check skipped: database not enabled',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('checkRedis', () => {
    it('Redis ping succeeds → logger.log called with OK message', async () => {
      const mockRedisInstance = {
        connect: jest.fn().mockResolvedValue(undefined),
        ping: jest.fn().mockResolvedValue('PONG'),
        disconnect: jest.fn(),
      };

      mockedRedis.mockImplementation(() => mockRedisInstance as any);

      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: {
          enabled: true,
          host: 'localhost',
          port: 6379,
          password: 'secret',
          db: 0,
        },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockRedisInstance.connect).toHaveBeenCalled();
      expect(mockRedisInstance.ping).toHaveBeenCalled();
      expect(mockLoggerLog).toHaveBeenCalledWith(
        'Redis connectivity check: OK',
      );
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('Redis ping fails → logger.warn called', async () => {
      const mockRedisInstance = {
        connect: jest.fn().mockRejectedValue(new Error('Connection timeout')),
        ping: jest.fn(),
        disconnect: jest.fn(),
      };

      mockedRedis.mockImplementation(() => mockRedisInstance as any);

      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: {
          enabled: true,
          host: 'localhost',
          port: 6379,
          password: 'secret',
          db: 0,
        },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Redis unreachable: Connection timeout',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();
    });

    it('Redis disabled → no redis client created', async () => {
      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: {
          enabled: false,
          host: 'localhost',
          port: 6379,
          password: 'secret',
          db: 0,
        },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockedRedis).not.toHaveBeenCalled();
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Redis check skipped: redis not enabled',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('checkTelegramBot', () => {
    it('Telegram getMe succeeds → logger.log with bot username', async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue({ ok: true, result: { username: 'testBot' } }),
      } as unknown as Response;
      jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockLoggerLog).toHaveBeenCalledWith(
        'Telegram Bot API: connected as @testBot',
      );
      expect(mockLoggerWarn).not.toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it('Telegram getMe fails (fetch throws) → logger.warn called', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Telegram Bot API unreachable: Network error',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it('Telegram getMe returns !ok → logger.warn called', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: false,
          error_code: 401,
          description: 'Unauthorized',
        }),
      } as unknown as Response;
      jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Telegram Bot API: responded with !ok',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it('Telegram bot token empty → skip, no fetch', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(() => Promise.resolve(new Response()));

      const config = createMockConfigService({
        database: {
          enabled: false,
          host: '',
          port: 0,
          username: '',
          password: '',
          database: '',
        },
        redis: { enabled: false, host: '', port: 0, password: '', db: 0 },
        telegram: {
          botToken: '',
          mtprotoApiId: 0,
          mtprotoApiHash: '',
          mtprotoSession: '',
        },
        publishing: {
          vipCalls: { botToken: '' },
          cryptoNews: { botToken: '' },
          chainDexterBot: { botToken: '' },
        },
      });

      service = new ConfigConnectivityService(config);
      await service.onApplicationBootstrap();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Telegram Bot API check skipped (vipCalls): no bot token configured',
      );
      expect(mockLoggerLog).not.toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled();

      jest.restoreAllMocks();
    });
  });

  describe('Unexpected error handling', () => {
    it('Unexpected error in any check is caught → never crashes', async () => {
      // Mock config service to throw
      const config = {
        get: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected config error');
        }),
      } as unknown as ConfigService;

      service = new ConfigConnectivityService(config);

      // Should not throw
      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    });
  });
});
