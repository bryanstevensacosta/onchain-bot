import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { JsonResolvedChannelMetadataRepository } from 'discovery/ingestion/telegram/infrastructure/persistence/json-resolved-channel-metadata.repository';

function makeTempDir(): string {
  return path.join(
    os.tmpdir(),
    `onchain-bot-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

describe('JsonResolvedChannelMetadataRepository', () => {
  let dir: string;
  let filePath: string;
  let repo: JsonResolvedChannelMetadataRepository;

  beforeEach(async () => {
    dir = makeTempDir();
    filePath = path.join(dir, 'cache.json');
    repo = new JsonResolvedChannelMetadataRepository(filePath);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns null when the cache file does not exist', async () => {
    expect(await repo.find('111')).toBeNull();
    expect(await repo.findAll()).toEqual([]);
  });

  it('upserts and reads back a single entry', async () => {
    await repo.upsert({
      channelId: '111',
      title: 'Alpha Channel',
      username: 'alphach',
      resolvedAt: '2026-06-19T17:00:00.000Z',
      source: 'mtproto',
    });

    const entry = await repo.find('111');
    expect(entry).toEqual({
      channelId: '111',
      title: 'Alpha Channel',
      username: 'alphach',
      resolvedAt: '2026-06-19T17:00:00.000Z',
      source: 'mtproto',
    });
  });

  it('upserts are idempotent on channelId (overwrite)', async () => {
    await repo.upsert({
      channelId: '111',
      title: 'Old',
      username: null,
      resolvedAt: '2026-06-19T17:00:00.000Z',
      source: 'mtproto',
    });
    await repo.upsert({
      channelId: '111',
      title: 'New',
      username: 'newch',
      resolvedAt: '2026-06-19T18:00:00.000Z',
      source: 'seed',
    });

    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('New');
    expect(all[0].username).toBe('newch');
    expect(all[0].source).toBe('seed');
  });

  it('serializes concurrent upserts without lost updates', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      repo.upsert({
        channelId: `id-${i}`,
        title: `Title ${i}`,
        username: null,
        resolvedAt: '2026-06-19T17:00:00.000Z',
        source: 'mtproto',
      }),
    );
    await Promise.all(writes);

    const all = await repo.findAll();
    expect(all).toHaveLength(10);
    const titles = all.map((e) => e.title).sort();
    expect(titles).toEqual([
      'Title 0',
      'Title 1',
      'Title 2',
      'Title 3',
      'Title 4',
      'Title 5',
      'Title 6',
      'Title 7',
      'Title 8',
      'Title 9',
    ]);
  });

  it('persists to disk so a fresh repository instance can read the same data', async () => {
    await repo.upsert({
      channelId: '222',
      title: 'Beta',
      username: 'beta',
      resolvedAt: '2026-06-19T17:00:00.000Z',
      source: 'mtproto',
    });

    const fresh = new JsonResolvedChannelMetadataRepository(filePath);
    const entry = await fresh.find('222');
    expect(entry?.title).toBe('Beta');
  });

  it('skips malformed entries instead of throwing', async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        entries: [
          { channelId: '1', title: 'ok', resolvedAt: 'x', source: 'mtproto' },
          { channelId: '2' },
          'not-an-object',
          null,
        ],
      }),
      'utf-8',
    );

    const fresh = new JsonResolvedChannelMetadataRepository(filePath);
    const all = await fresh.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].channelId).toBe('1');
  });

  it('treats a corrupt JSON file as an empty cache (logs warning)', async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, '{not json', 'utf-8');

    const fresh = new JsonResolvedChannelMetadataRepository(filePath);
    const all = await fresh.findAll();
    expect(all).toEqual([]);
  });

  it('creates the parent directory on first write', async () => {
    const nested = path.join(dir, 'a', 'b', 'cache.json');
    const nestedRepo = new JsonResolvedChannelMetadataRepository(nested);
    await nestedRepo.upsert({
      channelId: '1',
      title: 'nested',
      username: null,
      resolvedAt: '2026-06-19T17:00:00.000Z',
      source: 'seed',
    });
    const stat = await fs.stat(nested);
    expect(stat.isFile()).toBe(true);
  });
});
