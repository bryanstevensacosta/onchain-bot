import { parseSeedCliArgs, runSeedCli } from './display-map-seed.cli';

describe('parseSeedCliArgs', () => {
  it('defaults to dry-run with the shipped catalog', () => {
    expect(parseSeedCliArgs([])).toEqual({
      apply: false,
      file: null,
      allowProd: false,
    });
  });

  it('accepts --apply, --file=<path> and --allow-prod', () => {
    expect(
      parseSeedCliArgs(['--apply', '--file=/tmp/seed.json', '--allow-prod']),
    ).toEqual({
      apply: true,
      file: '/tmp/seed.json',
      allowProd: true,
    });
  });

  it('accepts an explicit --dry-run', () => {
    expect(parseSeedCliArgs(['--dry-run']).apply).toBe(false);
  });

  it('rejects --apply together with --dry-run', () => {
    expect(() => parseSeedCliArgs(['--apply', '--dry-run'])).toThrow(
      /mutually exclusive/,
    );
  });

  it('rejects --file without a path', () => {
    expect(() => parseSeedCliArgs(['--file='])).toThrow(/requires a path/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseSeedCliArgs(['--force'])).toThrow(/Unknown argument/);
  });
});

describe('runSeedCli guards', () => {
  const savedEnabled = process.env.DATABASE_ENABLED;
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (savedEnabled === undefined) {
      delete process.env.DATABASE_ENABLED;
    } else {
      process.env.DATABASE_ENABLED = savedEnabled;
    }
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    jest.restoreAllMocks();
  });

  it('aborts when DATABASE_ENABLED=false (in-memory would not persist)', async () => {
    process.env.DATABASE_ENABLED = 'false';
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runSeedCli(['--apply'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_ENABLED=false'),
    );
  });

  it('refuses NODE_ENV=production without --allow-prod', async () => {
    process.env.DATABASE_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runSeedCli(['--apply'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('NODE_ENV=production is refused'),
    );
  });

  it('aborts on an invalid --file path before opening a context', async () => {
    process.env.DATABASE_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      runSeedCli(['--dry-run', '--file=/tmp/definitely-not-a-seed.json']),
    ).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Cannot read seed file'),
    );
  });
});
