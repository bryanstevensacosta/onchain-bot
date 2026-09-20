import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupsStatusService } from './backups-status.service';

describe('BackupsStatusService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ops-backups-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function serviceFor(file: string): BackupsStatusService {
    return new BackupsStatusService(join(dir, file));
  }

  async function write(file: string, content: string): Promise<void> {
    await writeFile(join(dir, file), content, 'utf8');
  }

  function rolling(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      updated_at: new Date().toISOString(),
      latest_file: 'prod-backend-20260920.dump.gz',
      latest_age_h: 3.5,
      count: 7,
      disk_pct: 42,
      last_drill: {
        at: new Date().toISOString(),
        result: 'pass',
        restored_tables: 39,
        restored_rows: 123,
      },
      ...overrides,
    });
  }

  it('green file maps the frozen DTO verbatim', async () => {
    await write('green.json', rolling());
    const view = await serviceFor('green.json').getStatus();
    expect(view.verdict).toBe('green');
    expect(view.newestFile).toBe('prod-backend-20260920.dump.gz');
    expect(view.newestAgeH).toBe('3.5h');
    expect(view.dumpCount).toBe(7);
    expect(view.diskPct).toBe(42);
    expect(view.bucket).toBeNull();
    expect(view.offsiteLag).toBeNull();
    expect(view.lastDrillResult).toBe('pass');
    expect(view.stale).toBe(false);
    expect(view.error).toBeUndefined();
  });

  it('missing file returns the red shape (never throws)', async () => {
    const view = await serviceFor('does-not-exist.json').getStatus();
    expect(view.verdict).toBe('red');
    expect(view.stale).toBe(true);
    expect(view.newestFile).toBe('(missing)');
    expect(view.newestAgeH).toBe('unknown');
    expect(view.dumpCount).toBe(0);
    expect(view.diskPct).toBe(0);
    expect(view.bucket).toBeNull();
    expect(view.offsiteLag).toBeNull();
    expect(view.lastDrillAt).toBeNull();
    expect(view.lastDrillResult).toBe('unknown');
    expect(view.error).toContain('not found');
  });

  it('stale backup (>26h) is red + stale', async () => {
    await write('stale.json', rolling({ latest_age_h: 30.2 }));
    const view = await serviceFor('stale.json').getStatus();
    expect(view.verdict).toBe('red');
    expect(view.stale).toBe(true);
    expect(view.newestAgeH).toBe('30.2h');
    expect(view.error).toContain('26h');
  });

  it('malformed JSON returns the red shape (never throws)', async () => {
    await write('broken.json', '{not json');
    const view = await serviceFor('broken.json').getStatus();
    expect(view.verdict).toBe('red');
    expect(view.stale).toBe(true);
    expect(view.lastDrillResult).toBe('unknown');
    expect(view.error).toContain('valid JSON');
  });

  it('count != 7 is amber (never fail on count)', async () => {
    await write('count.json', rolling({ count: 6 }));
    const view = await serviceFor('count.json').getStatus();
    expect(view.verdict).toBe('amber');
    expect(view.stale).toBe(false);
  });

  it('disk >= 80 is amber, >= 90 is red', async () => {
    await write('warn.json', rolling({ disk_pct: 85 }));
    expect((await serviceFor('warn.json').getStatus()).verdict).toBe('amber');
    await write('fail.json', rolling({ disk_pct: 93 }));
    expect((await serviceFor('fail.json').getStatus()).verdict).toBe('red');
  });
});
