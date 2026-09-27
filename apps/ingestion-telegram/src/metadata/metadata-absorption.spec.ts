/**
 * P58 absorption parity (metadata absorbs avatar fetch-serve).
 *
 * RED-first: `MetadataService` does not exist yet. Pins that the absorbed
 * behavior matches the old `KolAvatarService` contract 1:1 — fetch-once,
 * explicit refresh, placeholder on MTProto miss, legacy + handle-qualified
 * filenames with single-file dedupe — while the identity row gains the
 * metadata columns (kind/handle/phone-if-present/photo/url/type per id).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { MetadataService } from './metadata.service';
import type { MetadataPhotoPort } from './metadata-photo.port';
import { MetadataRepository } from './metadata.repository';
import type { TelegramChannelMetadataEntity } from './channel-metadata.entity';

function makeConfig(root: string): ConfigService {
  return {
    get: (key: string) => (key === 'app' ? { uploads: { root } } : undefined),
  } as unknown as ConfigService;
}

function makePhotos(result: Buffer | null): {
  photos: MetadataPhotoPort;
  calls: string[];
} {
  const calls: string[] = [];
  const photos = {
    fetchChannelPhoto: async (channelId: string) => {
      calls.push(channelId);
      return result;
    },
  };
  return { photos, calls };
}

function makeRepo(): {
  repo: MetadataRepository;
  rows: Map<string, TelegramChannelMetadataEntity>;
} {
  const rows = new Map<string, TelegramChannelMetadataEntity>();
  const repo = {
    findByChannelId: async (channelId: string) => rows.get(channelId) ?? null,
    findAll: async () => [...rows.values()],
    create: (
      channelId: string,
      partial?: Partial<TelegramChannelMetadataEntity>,
    ) => ({ channelId, ...(partial ?? {}) }) as TelegramChannelMetadataEntity,
    save: async (row: TelegramChannelMetadataEntity) => {
      rows.set(row.channelId, row);
      return row;
    },
  } as unknown as MetadataRepository;
  return { repo, rows };
}

describe('MetadataService absorption parity (P58 absorbs avatar/)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'metadata-absorb-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('fetch-once stores the file + metadata row, second call is cached', async () => {
    const { photos, calls } = makePhotos(Buffer.from('jpeg-bytes'));
    const { repo, rows } = makeRepo();
    const service = new MetadataService(makeConfig(root), photos, repo);
    const first = await service.fetchOnce('-1001', 'alpha');
    expect(first).toBe('fetched');
    const second = await service.fetchOnce('-1001', 'alpha');
    expect(second).toBe('cached');
    expect(calls).toEqual(['-1001']);
    const row = rows.get('-1001');
    expect(row?.avatarPath).toContain('avatar');
    expect(row?.handle).toBe('alpha');
  });

  it('MTProto miss resolves to placeholder and never throws', async () => {
    const { photos, calls } = makePhotos(null);
    const { repo } = makeRepo();
    const service = new MetadataService(makeConfig(root), photos, repo);
    await expect(service.fetchOnce('-1009', null)).resolves.toBe('placeholder');
    expect(calls).toEqual(['-1009']);
    expect(service.findAvatarFile('-1009')).toBeNull();
  });

  it('refresh re-downloads even when a file exists (explicit-only refetch)', async () => {
    const { photos, calls } = makePhotos(Buffer.from('jpeg-bytes'));
    const { repo } = makeRepo();
    const service = new MetadataService(makeConfig(root), photos, repo);
    await service.fetchOnce('-1002', null);
    await service.refresh('-1002', null);
    expect(calls).toEqual(['-1002', '-1002']);
  });

  it('migrates a legacy bare file to the handle-qualified name without re-download', async () => {
    const { photos, calls } = makePhotos(Buffer.from('jpeg-bytes'));
    const { repo } = makeRepo();
    const service = new MetadataService(makeConfig(root), photos, repo);
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1001.jpg'), 'legacy-bytes');
    const status = await service.fetchOnce('-1001', 'alpha');
    expect(status).toBe('cached');
    expect(calls).toEqual([]);
    expect(service.findAvatarFile('-1001')).toContain('-1001__alpha.jpg');
  });

  it('dedupes colliding legacy + handle files to a single file (no-dup)', async () => {
    const { photos } = makePhotos(Buffer.from('jpeg-bytes'));
    const { repo } = makeRepo();
    const service = new MetadataService(makeConfig(root), photos, repo);
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1001.jpg'), 'legacy-bytes');
    writeFileSync(join(root, 'avatar', '-1001__alpha.jpg'), 'handle-bytes');
    await service.fetchOnce('-1001', 'alpha');
    service.migrateFilename('-1001', 'alpha');
    expect(service.findAvatarFile('-1001')).toContain('-1001__alpha.jpg');
  });

  it('public view carries kind/handle/url/type per id (schema §1)', async () => {
    const { photos } = makePhotos(Buffer.from('jpeg-bytes'));
    const { repo } = makeRepo();
    const service = new MetadataService(makeConfig(root), photos, repo);
    await service.adoptRegistryRow('-1007', {
      handle: 'watcher',
      title: 'Watcher',
      kind: 'channel',
      isBot: false,
    });
    const view = await service.getView('-1007');
    expect(view).toMatchObject({
      channelId: '-1007',
      kind: 'channel',
      peerType: 'channel',
      handle: 'watcher',
      url: 'https://t.me/watcher',
      avatarUrl: '/api/metadata/-1007/avatar',
    });
  });
});
