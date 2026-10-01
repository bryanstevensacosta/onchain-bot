import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { KolAvatarService } from './kol-avatar.service';
import type { KolAvatarPhotoPort } from './kol-avatar-photo.port';

/**
 * Central todo 12 (P57): avatar backfill for ALL ids + @handle filename
 * migration with collision handling.
 *
 * FAILING-FIRST: `backfillMissing`, `findAvatarFile` and the
 * `fetchOnce(channelId, handle?)` overload do not exist yet — RED until
 * the avatar-total work lands.
 *
 * Invariants pinned here:
 * - fetch-once: rows that already have a file are never re-downloaded
 *   (only missing rows hit MTProto).
 * - MTProto failure → placeholder counts, never throws (deferred retry
 *   via explicit refresh).
 * - never-update + no-dup: legacy files migrate to the handle-qualified
 *   name with at most ONE file per channel on disk.
 */
function makeConfig(root: string): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app') {
        return { uploads: { root } };
      }
      return undefined;
    },
  } as unknown as ConfigService;
}

function makePhotos(result: Buffer | null, calls: string[] = []) {
  const photos: KolAvatarPhotoPort = {
    fetchChannelPhoto: async (channelId: string) => {
      calls.push(channelId);
      return result;
    },
  };
  return { photos, calls };
}

function makeSources(
  rows: Array<{ channelId: string; handle: string | null }>,
) {
  const saved: Array<{ channelId: string; avatarPath: string | null }> = [];
  return {
    saved,
    findAll: async () => rows.map((r) => ({ ...r })),
    findByChannelId: async (channelId: string) => {
      const row = rows.find((r) => r.channelId === channelId);
      return row
        ? {
            channelId: row.channelId,
            avatarPath: null as string | null,
            avatarUpdatedAt: null as Date | null,
          }
        : null;
    },
    save: async (row: { channelId: string; avatarPath: string | null }) => {
      saved.push({ channelId: row.channelId, avatarPath: row.avatarPath });
      return row;
    },
  };
}

describe('KolAvatarService backfill + @handle migration (central todo 12)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kol-avatar-backfill-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('backfills only rows missing a file (fetch-once respected)', async () => {
    const { photos, calls } = makePhotos(Buffer.from('jpeg-bytes'));
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1001.jpg'), 'pre-existing');
    const sources = makeSources([
      { channelId: '-1001', handle: 'alpha' },
      { channelId: '-1002', handle: 'beta' },
    ]);
    const service = new KolAvatarService(
      makeConfig(root),
      photos,
      sources as never,
    );

    const result = await service.backfillMissing();

    expect(result).toMatchObject({
      checked: 2,
      fetched: 1,
      cached: 1,
      placeholder: 0,
    });
    expect(calls).toEqual(['-1002']);
    expect(existsSync(join(root, 'avatar', '-1002__beta.jpg'))).toBe(true);
  });

  it('MTProto failure counts placeholder and never throws', async () => {
    const { photos, calls } = makePhotos(null);
    const sources = makeSources([{ channelId: '-1009', handle: null }]);
    const service = new KolAvatarService(
      makeConfig(root),
      photos,
      sources as never,
    );

    const result = await service.backfillMissing();

    expect(result).toMatchObject({
      checked: 1,
      fetched: 0,
      cached: 0,
      placeholder: 1,
    });
    expect(calls).toEqual(['-1009']);
    expect(service.hasAvatar('-1009')).toBe(false);
  });

  it('migrates a legacy file to the handle-qualified name without re-download', async () => {
    const { photos, calls } = makePhotos(Buffer.from('jpeg-bytes'));
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1001.jpg'), 'legacy-bytes');
    const sources = makeSources([{ channelId: '-1001', handle: 'alpha' }]);
    const service = new KolAvatarService(
      makeConfig(root),
      photos,
      sources as never,
    );

    await expect(service.fetchOnce('-1001', 'alpha')).resolves.toBe('cached');

    expect(calls).toEqual([]);
    expect(existsSync(join(root, 'avatar', '-1001__alpha.jpg'))).toBe(true);
    expect(existsSync(join(root, 'avatar', '-1001.jpg'))).toBe(false);
    expect(service.hasAvatar('-1001')).toBe(true);
  });

  it('dedupes colliding legacy + handle files to a single file (no-dup)', async () => {
    const { photos, calls } = makePhotos(Buffer.from('jpeg-bytes'));
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1001.jpg'), 'legacy-bytes');
    writeFileSync(join(root, 'avatar', '-1001__alpha.jpg'), 'handle-bytes');
    const sources = makeSources([{ channelId: '-1001', handle: 'alpha' }]);
    const service = new KolAvatarService(
      makeConfig(root),
      photos,
      sources as never,
    );

    await expect(service.fetchOnce('-1001', 'alpha')).resolves.toBe('cached');

    expect(calls).toEqual([]);
    expect(existsSync(join(root, 'avatar', '-1001__alpha.jpg'))).toBe(true);
    expect(existsSync(join(root, 'avatar', '-1001.jpg'))).toBe(false);
  });

  it('findAvatarFile resolves legacy files without a handle', async () => {
    const { photos } = makePhotos(Buffer.from('jpeg-bytes'));
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1005.jpg'), 'pre-existing');
    const service = new KolAvatarService(makeConfig(root), photos);

    expect(service.findAvatarFile('-1005')).toContain('-1005.jpg');
    expect(service.findAvatarFile('-1999')).toBeNull();
  });
});
