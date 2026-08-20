/**
 * Regression spec for `appConfig()` defaulting behavior on
 * `INGESTION_TELEGRAM_METADATA_CACHE_FILE`.
 *
 * Bug class: empty-string env var must be treated as missing, not as a real
 * value. `process.env.X ?? default` is insufficient because `??` only falls
 * back on `null`/`undefined`, not on `''`. The default path
 * `${process.cwd()}/.cache/kol-metadata.json` must be returned for both
 * empty-string and undefined cases. A real, non-empty value must be honored
 * verbatim.
 */
import { appConfig } from './app.config';

describe('appConfig', () => {
  const ENV_KEY = 'INGESTION_TELEGRAM_METADATA_CACHE_FILE';
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
  });

  describe('ingestion.telegram.metadataCache.filePath', () => {
    it('honors a real, non-empty path verbatim', () => {
      // Arrange
      process.env[ENV_KEY] = '/tmp/foo.json';

      // Act
      const result = appConfig();

      // Assert
      expect(result.ingestion.telegram.metadataCache.filePath).toBe(
        '/tmp/foo.json',
      );
    });

    it('falls back to the default path when the env var is an empty string', () => {
      // Arrange — the bug case. ?? does not fall back on '', so the
      // current implementation returns '' as the filePath.
      process.env[ENV_KEY] = '';

      // Act
      const result = appConfig();

      // Assert
      expect(result.ingestion.telegram.metadataCache.filePath).toBe(
        `${process.cwd()}/.cache/kol-metadata.json`,
      );
    });

    it('falls back to the default path when the env var is undefined', () => {
      // Arrange — delete the key entirely to mirror the unset case.
      delete process.env[ENV_KEY];

      // Act
      const result = appConfig();

      // Assert
      expect(result.ingestion.telegram.metadataCache.filePath).toBe(
        `${process.cwd()}/.cache/kol-metadata.json`,
      );
    });
  });

  /**
   * New mtproto config fields (Todo 1 of
   * `.omo/plans/fix-mtproto-listener-wedge.md`):
   *   - `INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL` (default 'error')
   *   - `INGESTION_TELEGRAM_MTPROTO_STARTUP_DELAY_MS` (default 60000, parseInt base 10)
   *   - `INGESTION_TELEGRAM_MTPROTO_USE_WSS` (default false, exactly 'true' → true, case-insensitive)
   *
   * Same bug class as `metadataCache.filePath`: empty-string env vars must be
   * treated as missing, not as a real value. `process.env.X ?? default` is
   * insufficient because `??` only falls back on `null`/`undefined`.
   */
  describe('telegram.mtprotoLogLevel', () => {
    const KEY = 'INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL';
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[KEY];
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env[KEY];
      } else {
        process.env[KEY] = original;
      }
    });

    it('defaults to "error" when the env var is undefined', () => {
      // Arrange
      delete process.env[KEY];

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoLogLevel).toBe('error');
    });

    it('defaults to "error" when the env var is an empty string', () => {
      // Arrange — empty-string bug class; ?? does NOT fall back on ''.
      process.env[KEY] = '';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoLogLevel).toBe('error');
    });

    it('honors a non-empty value verbatim (e.g. "debug")', () => {
      // Arrange
      process.env[KEY] = 'debug';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoLogLevel).toBe('debug');
    });
  });

  describe('telegram.mtprotoStartupDelayMs', () => {
    const KEY = 'INGESTION_TELEGRAM_MTPROTO_STARTUP_DELAY_MS';
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[KEY];
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env[KEY];
      } else {
        process.env[KEY] = original;
      }
    });

    it('defaults to 60000 when the env var is undefined', () => {
      // Arrange
      delete process.env[KEY];

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoStartupDelayMs).toBe(60000);
    });

    it('defaults to 60000 when the env var is an empty string', () => {
      // Arrange — parseInt('', 10) is NaN; empty-string bug class.
      process.env[KEY] = '';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoStartupDelayMs).toBe(60000);
    });

    it('honors a non-empty numeric value verbatim (e.g. "120000")', () => {
      // Arrange
      process.env[KEY] = '120000';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoStartupDelayMs).toBe(120000);
    });

    it('falls back to the default when the env var is non-numeric garbage', () => {
      // Arrange — adversarial: malformed input must not crash, must yield default.
      process.env[KEY] = 'abc';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoStartupDelayMs).toBe(60000);
    });
  });

  describe('telegram.mtprotoUseWss', () => {
    const KEY = 'INGESTION_TELEGRAM_MTPROTO_USE_WSS';
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[KEY];
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env[KEY];
      } else {
        process.env[KEY] = original;
      }
    });

    it('defaults to false when the env var is undefined', () => {
      // Arrange
      delete process.env[KEY];

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoUseWss).toBe(false);
    });

    it('defaults to false when the env var is an empty string', () => {
      // Arrange — empty-string bug class; '' must yield default false.
      process.env[KEY] = '';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoUseWss).toBe(false);
    });

    it('honors lowercase "true"', () => {
      // Arrange
      process.env[KEY] = 'true';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoUseWss).toBe(true);
    });

    it('honors uppercase "TRUE" (case-insensitive)', () => {
      // Arrange
      process.env[KEY] = 'TRUE';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoUseWss).toBe(true);
    });

    it('honors mixed-case "True" (case-insensitive)', () => {
      // Arrange
      process.env[KEY] = 'True';

      // Act
      const result = appConfig();

      // Assert
      expect(result.telegram.mtprotoUseWss).toBe(true);
    });
  });
});
