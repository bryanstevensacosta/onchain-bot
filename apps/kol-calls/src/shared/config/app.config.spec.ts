import {
  buildAppConfig,
  ConfigValidationError,
  validateKolCallsConfig,
} from './app.config';

const TIER_1_KEYS = ['ENCRYPTION_KEY', 'DATABASE_URL'] as const;

describe('kol-calls config (Tier-1 validation)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    for (const key of TIER_1_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of TIER_1_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  const validEnv = () => ({
    ENCRYPTION_KEY: 'encryption-key-123',
    DATABASE_URL: 'postgres://localhost:5432/kol',
  });

  it('passes when all Tier-1 keys are non-empty', () => {
    expect(validateKolCallsConfig({ ...process.env, ...validEnv() })).toEqual({
      warnings: expect.any(Array),
    });
  });

  it('boots without any bot configured (dashboard-only mode)', () => {
    expect(validateKolCallsConfig({ ...process.env, ...validEnv() })).toEqual({
      warnings: expect.any(Array),
    });
  });

  it('fails when ENCRYPTION_KEY is whitespace-only', () => {
    expect(() =>
      validateKolCallsConfig({ ...validEnv(), ENCRYPTION_KEY: '   ' }),
    ).toThrow(ConfigValidationError);
  });

  it('fails when DATABASE_URL is missing', () => {
    const env = { ...validEnv() };
    delete (env as Record<string, string | undefined>).DATABASE_URL;
    let error: ConfigValidationError | undefined;
    try {
      validateKolCallsConfig(env);
    } catch (e) {
      error = e as ConfigValidationError;
    }
    expect(error?.issues).toContainEqual(
      expect.objectContaining({ envVar: 'DATABASE_URL' }),
    );
  });

  it('reports all missing Tier-1 keys at once', () => {
    let error: ConfigValidationError | undefined;
    try {
      validateKolCallsConfig({});
    } catch (e) {
      error = e as ConfigValidationError;
    }
    expect(error?.issues).toHaveLength(2);
  });

  it('buildAppConfig honors env values and defaults', () => {
    expect(buildAppConfig({ ...validEnv(), PORT: '3040' }).port).toBe(3040);
    expect(buildAppConfig({ ...validEnv() }).port).toBe(3030);
    expect(buildAppConfig({ ...validEnv() }).encryptionKey).toBe(
      'encryption-key-123',
    );
    expect(buildAppConfig({}).encryptionKey).toBe('');
  });
});
