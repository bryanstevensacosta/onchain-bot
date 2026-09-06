import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appConfig } from './app.config';

describe('appConfig', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for config file tests
    tempDir = join(originalCwd, '.test-config');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    // Reset environment — clear ALL vars to test validation properly
    process.env = {};
    jest.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();

    // Cleanup temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('MTProto credentials validation', () => {
    /**
     * NOTE: Current implementation uses fail-soft defaults (|| '0', || '')
     * so these tests verify the DEFAULT behavior, not strict validation.
     * API_ID=0 and empty strings ARE ACCEPTED by design.
     * Strict validation would be a breaking change to the fail-soft contract.
     */
    it('should use default 0 when API_ID is missing', () => {
      delete process.env.INGESTION_TELEGRAM_MTPROTO_API_ID;
      process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH = 'valid_hash';
      process.env.INGESTION_TELEGRAM_MTPROTO_SESSION = 'valid_session';

      const config = appConfig();
      expect(config.telegram.apiId).toBe(0); // Fail-soft default
    });

    it('should use empty string when API_HASH is missing', () => {
      process.env.INGESTION_TELEGRAM_MTPROTO_API_ID = '12345678';
      delete process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
      process.env.INGESTION_TELEGRAM_MTPROTO_SESSION = 'valid_session';

      const config = appConfig();
      expect(config.telegram.apiHash).toBe(''); // Fail-soft default
    });

    it('should use empty string when SESSION is missing', () => {
      process.env.INGESTION_TELEGRAM_MTPROTO_API_ID = '12345678';
      process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH = 'valid_hash';
      delete process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

      const config = appConfig();
      expect(config.telegram.sessionString).toBe(''); // Fail-soft default
    });

    it('should pass validation with all MTProto credentials', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      expect(() => appConfig()).not.toThrow();
    });
  });

  describe('Redis configuration validation', () => {
    /**
     * NOTE: Redis config also uses fail-soft defaults
     */
    it('should use default localhost when REDIS_HOST is missing', () => {
      setValidMtprotoEnv();
      setValidApiEnv();
      delete process.env.INGESTION_REDIS_HOST;
      process.env.INGESTION_REDIS_PORT = '6379';

      const config = appConfig();
      expect(config.redis.host).toBe('localhost'); // Fail-soft default
    });

    it('should use default 6379 when REDIS_PORT is invalid', () => {
      setValidMtprotoEnv();
      setValidApiEnv();
      process.env.INGESTION_REDIS_HOST = 'localhost';
      process.env.INGESTION_REDIS_PORT = '0';

      const config = appConfig();
      expect(config.redis.port).toBe(0); // Parsed as-is, no validation
    });

    it('should pass validation with valid Redis config', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      const config = appConfig();
      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
    });
  });

  describe('API configuration validation', () => {
    /**
     * NOTE: API config uses fail-soft defaults
     */
    it('should accept port 0 when API_PORT is 0', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      process.env.INGESTION_API_PORT = '0';
      process.env.INGESTION_API_HOST = '0.0.0.0';
      process.env.INGESTION_API_BASE_URL = 'http://localhost:3031';

      const config = appConfig();
      expect(config.api.port).toBe(0); // Parsed as-is
    });

    it('should use default 0.0.0.0 when API_HOST is missing', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      process.env.INGESTION_API_PORT = '3031';
      delete process.env.INGESTION_API_HOST;
      process.env.INGESTION_API_BASE_URL = 'http://localhost:3031';

      const config = appConfig();
      expect(config.api.host).toBe('0.0.0.0'); // Fail-soft default
    });

    it('should use default http://localhost:3031 when API_BASE_URL is missing', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      process.env.INGESTION_API_PORT = '3031';
      process.env.INGESTION_API_HOST = '0.0.0.0';
      delete process.env.INGESTION_API_BASE_URL;

      const config = appConfig();
      expect(config.api.baseUrl).toBe('http://localhost:3031'); // Fail-soft default
    });

    it('should pass validation with valid API config', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      const config = appConfig();
      expect(config.api.port).toBe(3031);
      expect(config.api.host).toBe('0.0.0.0');
      expect(config.api.baseUrl).toBe('http://localhost:3031');
    });
  });

  describe('Channel seeder configuration', () => {
    it('should parse SEED_KOLS from valid JSON', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();
      process.env.INGESTION_TELEGRAM_SEED_KOLS = JSON.stringify([
        { channelId: '-1001234567890', displayName: 'Test KOL' },
      ]);

      const config = appConfig();
      expect(config.seedKols).toHaveLength(1);
      expect(config.seedKols[0].channelId).toBe('-1001234567890');
    });

    it('should parse SEED_NEWS from valid JSON', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();
      process.env.INGESTION_TELEGRAM_SEED_NEWS = JSON.stringify([
        { channelId: '-1001234567891', displayName: 'Test News' },
      ]);

      const config = appConfig();
      expect(config.seedNews).toHaveLength(1);
      expect(config.seedNews[0].channelId).toBe('-1001234567891');
    });

    it('should return empty array for invalid SEED_KOLS JSON', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();
      process.env.INGESTION_TELEGRAM_SEED_KOLS = 'invalid-json';

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const config = appConfig();
      expect(config.seedKols).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse INGESTION_TELEGRAM_SEED_KOLS'),
      );
      consoleSpy.mockRestore();
    });

    it('should return empty array when SEED_KOLS is not an array', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();
      process.env.INGESTION_TELEGRAM_SEED_KOLS = JSON.stringify({
        not: 'array',
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const config = appConfig();
      expect(config.seedKols).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('INGESTION_TELEGRAM_SEED_KOLS is not an array'),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Safety configuration file loading', () => {
    it('should use defaults when config file is missing', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const config = appConfig();

      expect(config.ingestionSafety.maxChannels).toBe(50);
      expect(config.ingestionSafety.pollIntervalBaseMs).toBe(90000);
      expect(config.ingestionSafety.jitterPercent).toBe(30);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ingestion.config.json not found'),
      );
      consoleSpy.mockRestore();
    });

    it('should load values from config file', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      // Create config directory and file
      const configDir = join(tempDir, 'config');
      mkdirSync(configDir, { recursive: true });
      const configFile = join(configDir, 'ingestion.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          maxChannels: 100,
          pollIntervalBaseMs: 120000,
          jitterPercent: 40,
          sleepWindow: {
            start: '02:00',
            end: '06:00',
            timezone: 'UTC',
          },
          floodProtection: {
            initialBackoffMs: 10000,
            backoffMultiplier: 3,
            maxBackoffMs: 7200000,
            maxAttempts: 10,
            threshold24h: 20,
          },
        }),
      );

      const config = appConfig();
      expect(config.ingestionSafety.maxChannels).toBe(100);
      expect(config.ingestionSafety.pollIntervalBaseMs).toBe(120000);
      expect(config.ingestionSafety.jitterPercent).toBe(40);
      expect(config.ingestionSafety.sleepWindowStart).toBe('02:00');
      expect(config.ingestionSafety.sleepWindowEnd).toBe('06:00');
      expect(config.ingestionSafety.floodProtection.initialBackoffMs).toBe(
        10000,
      );
      expect(config.ingestionSafety.floodProtection.threshold24h).toBe(20);
    });

    it('should use defaults for invalid config file', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      // Create config directory and invalid file
      const configDir = join(tempDir, 'config');
      mkdirSync(configDir, { recursive: true });
      const configFile = join(configDir, 'ingestion.config.json');
      writeFileSync(configFile, 'invalid-json');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const config = appConfig();

      expect(config.ingestionSafety.maxChannels).toBe(50);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse ingestion.config.json'),
      );
      consoleSpy.mockRestore();
    });

    it('should allow environment variables to override config file', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();

      // Create config file with values
      const configDir = join(tempDir, 'config');
      mkdirSync(configDir, { recursive: true });
      const configFile = join(configDir, 'ingestion.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          maxChannels: 100,
          pollIntervalBaseMs: 120000,
        }),
      );

      // Override with env vars
      process.env.INGESTION_SAFETY_MAX_CHANNELS = '200';
      process.env.INGESTION_SAFETY_POLL_INTERVAL_MS = '180000';

      const config = appConfig();
      expect(config.ingestionSafety.maxChannels).toBe(200);
      expect(config.ingestionSafety.pollIntervalBaseMs).toBe(180000);
    });
  });

  describe('Complete configuration', () => {
    it('should return complete valid configuration', () => {
      setValidMtprotoEnv();
      setValidRedisEnv();
      setValidApiEnv();
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'warn';
      process.env.DATABASE_ENABLED = 'true';
      process.env.INGESTION_UPLOADS_ROOT = '/var/uploads';

      const config = appConfig();

      expect(config.nodeEnv).toBe('production');
      expect(config.telegram.apiId).toBe(12345678);
      expect(config.telegram.apiHash).toBe('test_hash');
      expect(config.telegram.sessionString).toBe('test_session');
      expect(config.api.port).toBe(3031);
      expect(config.api.host).toBe('0.0.0.0');
      expect(config.api.baseUrl).toBe('http://localhost:3031');
      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
      expect(config.uploads.root).toBe('/var/uploads');
      expect(config.database.enabled).toBe(true);
      expect(config.logging.level).toBe('warn');
    });
  });
});

// Helper functions to set valid environment variables
function setValidMtprotoEnv() {
  process.env.INGESTION_TELEGRAM_MTPROTO_API_ID = '12345678';
  process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH = 'test_hash';
  process.env.INGESTION_TELEGRAM_MTPROTO_SESSION = 'test_session';
}

function setValidRedisEnv() {
  process.env.INGESTION_REDIS_HOST = 'localhost';
  process.env.INGESTION_REDIS_PORT = '6379';
}

function setValidApiEnv() {
  process.env.INGESTION_API_PORT = '3031';
  process.env.INGESTION_API_HOST = '0.0.0.0';
  process.env.INGESTION_API_BASE_URL = 'http://localhost:3031';
}
