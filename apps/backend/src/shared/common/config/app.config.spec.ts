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
});
