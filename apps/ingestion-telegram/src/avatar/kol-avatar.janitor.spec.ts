import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { CryptoNewsRetentionCleanupScheduler } from '../retention/infrastructure/scheduling/crypto-news-retention-cleanup.scheduler';

function makeConfig(root: string): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app') {
        return { cryptoNewsMediaRetentionHours: 72 };
      }
      if (key === 'app.uploads.root') {
        return root;
      }
      if (key === 'app.uploads.mediaPath') {
        return 'feed/media';
      }
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('Retention janitor anti-avatar guarantee (P19 permanent)', () => {
  let root: string;
  let queries: string[];

  function makeScheduler() {
    queries = [];
    const dataSource = {
      options: { type: 'postgres' },
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('pg_try_advisory_lock')) {
          return [{ acquired: true }];
        }
        if (sql.includes('pg_advisory_unlock')) {
          return [];
        }
        if (sql.includes('SELECT file_path FROM')) {
          return [];
        }
        return [];
      },
    };
    return new CryptoNewsRetentionCleanupScheduler(
      dataSource as never,
      makeConfig(root),
    );
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kol-avatar-janitor-'));
    mkdirSync(join(root, 'feed', 'media', '-1001'), { recursive: true });
    mkdirSync(join(root, 'avatar'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('avatar files survive a retention tick while orphan media is swept', async () => {
    const avatarFile = join(root, 'avatar', '-1001.jpg');
    writeFileSync(avatarFile, 'permanent-avatar');
    const orphanMedia = join(root, 'feed', 'media', '-1001', '9_0.jpg');
    writeFileSync(orphanMedia, 'orphan');
    const old = Date.now() - 25 * 60 * 60 * 1000;
    utimesSync(orphanMedia, new Date(old), new Date(old));

    await makeScheduler().tick();

    expect(existsSync(orphanMedia)).toBe(false);
    expect(existsSync(avatarFile)).toBe(true);
  });

  it('janitor SQL never references avatar storage', async () => {
    await makeScheduler().tick();
    const avatarRefs = queries.filter((sql) =>
      sql.toLowerCase().includes('avatar'),
    );
    expect(avatarRefs).toEqual([]);
    expect(queries.some((sql) => sql.includes('telegram_feed_messages'))).toBe(
      true,
    );
  });
});
