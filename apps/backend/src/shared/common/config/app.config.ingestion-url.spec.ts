/**
 * Matrix spec for the canonical `INGESTION_TELEGRAM_URL` resolution
 * (plan `.omo/plans/deprecados-deuda-tecnica.md`, todo 10).
 *
 * Resolution order under test (`resolveIngestionServiceUrl`):
 *   INGESTION_TELEGRAM_URL > default (http://localhost:3031).
 * The deprecated `INGESTION_SERVICE_URL` fallback was removed in T10 —
 * setting it has no effect and emits no warning. Empty strings count
 * as missing.
 */
import {
  appConfig,
  DEFAULT_INGESTION_TELEGRAM_URL,
  resolveIngestionServiceUrl,
} from './app.config';

describe('resolveIngestionServiceUrl matrix (todo 10, canonical only)', () => {
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

  it('case 1/3 (new-only): resolves the new var with no warning', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: NEW_URL,
    });

    expect(url).toBe(NEW_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('case 2/3 (old-only): legacy var is ignored → default, no warning', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [OLD_KEY]: OLD_URL,
    });

    expect(url).toBe(DEFAULT_INGESTION_TELEGRAM_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('case 3/3 (neither): falls back to the default with no warning', () => {
    const env = { ...process.env };
    delete env[NEW_KEY];
    delete env[OLD_KEY];

    expect(resolveIngestionServiceUrl(env)).toBe(
      DEFAULT_INGESTION_TELEGRAM_URL,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('new wins over legacy (legacy ignored, no warning)', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: NEW_URL,
      [OLD_KEY]: OLD_URL,
    });

    expect(url).toBe(NEW_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('treats empty new as missing (→ default, no warning)', () => {
    const url = resolveIngestionServiceUrl({
      ...process.env,
      [NEW_KEY]: '',
      [OLD_KEY]: OLD_URL,
    });

    expect(url).toBe(DEFAULT_INGESTION_TELEGRAM_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('default URL stays :3031 (canonical, unchanged by T10)', () => {
    expect(DEFAULT_INGESTION_TELEGRAM_URL).toBe('http://localhost:3031');
  });

  it('integration: appConfig().ingestion.serviceUrl honors new > default, ignores legacy', () => {
    process.env[NEW_KEY] = NEW_URL;
    process.env[OLD_KEY] = OLD_URL;
    expect(appConfig().ingestion.serviceUrl).toBe(NEW_URL);
    expect(warnSpy).not.toHaveBeenCalled();

    delete process.env[NEW_KEY];
    expect(appConfig().ingestion.serviceUrl).toBe(
      DEFAULT_INGESTION_TELEGRAM_URL,
    );
    expect(warnSpy).not.toHaveBeenCalled();

    delete process.env[OLD_KEY];
    expect(appConfig().ingestion.serviceUrl).toBe(
      DEFAULT_INGESTION_TELEGRAM_URL,
    );
  });
});
