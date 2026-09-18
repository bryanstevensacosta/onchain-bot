/**
 * Matrix spec for the `INGESTION_SERVICE_URL` → `INGESTION_TELEGRAM_URL`
 * rename (plan `.omo/plans/rename-ingestion-telegram.md`, todo 5).
 *
 * Resolution order under test (`resolveIngestionServiceUrl`):
 *   INGESTION_TELEGRAM_URL > INGESTION_SERVICE_URL (deprecated) > default.
 * A `console.warn` must fire exactly when the deprecated var supplies the
 * value. Empty strings count as missing (same bug class as the
 * `INGESTION_TELEGRAM_METADATA_CACHE_FILE` regression spec).
 */
import {
  appConfig,
  DEFAULT_INGESTION_TELEGRAM_URL,
  resolveIngestionServiceUrl,
} from './app.config';

describe('resolveIngestionServiceUrl matrix (todo 5)', () => {
  const NEW_KEY = 'INGESTION_TELEGRAM_URL';
  const OLD_KEY = 'INGESTION_SERVICE_URL';
  const NEW_URL = 'http://new-ingestion:3031';
  const OLD_URL = 'http://old-ingestion:3031';

  let warnSpy: jest.SpyInstance;
  let savedNew: string | undefined;
  let savedOld: string | undefined;

  beforeEach(() => {
    savedNew = process.env[NEW_KEY];
    savedOld = process.env[OLD_KEY];
    delete process.env[NEW_KEY];
    delete process.env[OLD_KEY];
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (savedNew === undefined) {
      delete process.env[NEW_KEY];
    } else {
      process.env[NEW_KEY] = savedNew;
    }
    if (savedOld === undefined) {
      delete process.env[OLD_KEY];
    } else {
      process.env[OLD_KEY] = savedOld;
    }
  });

  it('case 1/4 (new-only): resolves the new var with no warning', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: NEW_URL,
    } as NodeJS.ProcessEnv);

    expect(url).toBe(NEW_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('case 2/4 (old-only): resolves the old var AND warns once', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [OLD_KEY]: OLD_URL,
    } as NodeJS.ProcessEnv);

    expect(url).toBe(OLD_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(
      /INGESTION_SERVICE_URL is deprecated, migrate to INGESTION_TELEGRAM_URL/,
    );
  });

  it('case 3/4 (both): the new var wins with no warning', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: NEW_URL,
      [OLD_KEY]: OLD_URL,
    } as NodeJS.ProcessEnv);

    expect(url).toBe(NEW_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('case 4/4 (neither): falls back to the default with no warning', () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env[NEW_KEY];
    delete env[OLD_KEY];

    expect(resolveIngestionServiceUrl(env)).toBe(
      DEFAULT_INGESTION_TELEGRAM_URL,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('treats empty strings as missing (new empty + old set → old + warn)', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: '',
      [OLD_KEY]: OLD_URL,
    } as NodeJS.ProcessEnv);

    expect(url).toBe(OLD_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('treats both-empty as missing (→ default, no warning)', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: '',
      [OLD_KEY]: '',
    } as NodeJS.ProcessEnv);

    expect(url).toBe(DEFAULT_INGESTION_TELEGRAM_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('integration: appConfig().ingestion.serviceUrl honors new > old > default', () => {
    process.env[NEW_KEY] = NEW_URL;
    process.env[OLD_KEY] = OLD_URL;
    expect(appConfig().ingestion.serviceUrl).toBe(NEW_URL);
    expect(warnSpy).not.toHaveBeenCalled();

    delete process.env[NEW_KEY];
    expect(appConfig().ingestion.serviceUrl).toBe(OLD_URL);
    expect(warnSpy).toHaveBeenCalled();

    delete process.env[OLD_KEY];
    expect(appConfig().ingestion.serviceUrl).toBe(
      DEFAULT_INGESTION_TELEGRAM_URL,
    );
  });
});
