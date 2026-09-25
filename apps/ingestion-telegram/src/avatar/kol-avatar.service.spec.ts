import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { KolAvatarService } from './kol-avatar.service';
import type { KolAvatarPhotoPort } from './kol-avatar-photo.port';

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

function makePhotos(result: Buffer | null): KolAvatarPhotoPort & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetchChannelPhoto: async (channelId: string) => {
      calls.push(channelId);
      return result;
    },
  };
}

function makeSources() {
  const saved: Array<{ channelId: string; avatarPath: string | null }> = [];
  return {
    saved,
    findByChannelId: async (channelId: string) => ({
      channelId,
      avatarPath: null as string | null,
      avatarUpdatedAt: null as Date | null,
    }),
    save: async (row: { channelId: string; avatarPath: string | null }) => {
      saved.push({ channelId: row.channelId, avatarPath: row.avatarPath });
      return row;
    },
  };
}

describe('KolAvatarService (P19 fetch-once + P29 serialized)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kol-avatar-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('fetches once and skips the second fetch when the file exists', async () => {
    const photos = makePhotos(Buffer.from('jpeg-bytes'));
    const sources = makeSources();
    const service = new KolAvatarService(
      makeConfig(root),
      photos,
      sources as never,
    );

    expect(await service.fetchOnce('-1001')).toBe('fetched');
    expect(await service.fetchOnce('-1001')).toBe('cached');
    expect(photos.calls).toEqual(['-1001']);
    expect(sources.saved).toHaveLength(1);
    expect(sources.saved[0].avatarPath).toContain('avatar');
  });

  it('MTProto failure resolves to placeholder and never throws (deferred retry)', async () => {
    const photos = makePhotos(null);
    const sources = makeSources();
    const service = new KolAvatarService(
      makeConfig(root),
      photos,
      sources as never,
    );

    await expect(service.fetchOnce('-1002')).resolves.toBe('placeholder');
    expect(service.hasAvatar('-1002')).toBe(false);
    expect(sources.saved).toHaveLength(0);
    // Deferred retry: explicit refresh attempts the fetch again.
    await expect(service.refresh('-1002')).resolves.toBe('placeholder');
    expect(photos.calls).toEqual(['-1002', '-1002']);
  });

  it('serializes concurrent fetches (P29: no bursts, one at a time)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const photos: KolAvatarPhotoPort = {
      fetchChannelPhoto: async (channelId: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return Buffer.from(`photo-${channelId}`);
      },
    };
    const service = new KolAvatarService(makeConfig(root), photos);

    const results = await Promise.all([
      service.fetchOnce('-10010'),
      service.fetchOnce('-10011'),
      service.fetchOnce('-10012'),
    ]);
    expect(results).toEqual(['fetched', 'fetched', 'fetched']);
    expect(maxInFlight).toBe(1);
  });

  it('stores avatars under uploads/avatar (permanent, janitor-excluded)', async () => {
    const photos = makePhotos(Buffer.from('jpeg-bytes'));
    const service = new KolAvatarService(makeConfig(root), photos);
    await service.fetchOnce('-1003');
    const dir = join(root, 'avatar');
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, '-1003.jpg'))).toBe(true);
    mkdirSync(join(root, 'avatar'), { recursive: true });
  });

  it('avatarUrlFor builds the dedicated endpoint URL', () => {
    const service = new KolAvatarService(makeConfig(root), makePhotos(null));
    expect(service.avatarUrlFor('-1001')).toBe('/api/kol-avatar/-1001');
  });
});
