import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { DomainError } from 'shared/kernel/domain-error';
import { ScheduledAd } from '../../../domain/scheduled-ad.entity';
import { InMemoryScheduledAdRepository } from './in-memory-scheduled-ad.repository';
import { LocalSchedulingMediaStorageAdapter } from '../../storage/local-scheduling-media-storage.adapter';

describe('InMemoryScheduledAdRepository', () => {
  it('lists in catalog order and filters active/expired', async () => {
    const repo = new InMemoryScheduledAdRepository();
    const now = new Date('2026-09-25T10:00:00.000Z');
    await repo.save(
      ScheduledAd.create({ id: 'b', name: 'b-post', body: 'b', order: 2 }),
    );
    await repo.save(
      ScheduledAd.create({
        id: 'gone',
        name: 'gone-post',
        body: 'old',
        order: 0,
        expiresAt: new Date('2026-09-20T10:00:00.000Z'),
      }),
    );
    await repo.save(
      ScheduledAd.create({ id: 'a', name: 'a-post', body: 'a', order: 1 }),
    );
    expect((await repo.findAll()).map((ad) => ad.id)).toEqual([
      'gone',
      'a',
      'b',
    ]);
    expect((await repo.findAllActive(now)).map((ad) => ad.id)).toEqual([
      'a',
      'b',
    ]);
    expect((await repo.findExpired(now)).map((ad) => ad.id)).toEqual(['gone']);
  });

  it('rejects duplicate names with a PG-shaped violation', async () => {
    const repo = new InMemoryScheduledAdRepository();
    await repo.save(ScheduledAd.create({ name: 'promo', body: 'hi' }));
    const err = await repo
      .save(ScheduledAd.create({ name: 'promo', body: 'dup' }))
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('23505');
  });

  it('tracks failures, disable, and publish stats', async () => {
    const repo = new InMemoryScheduledAdRepository();
    await repo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await repo.incrementFailures('a1');
    expect((await repo.findById('a1'))?.consecutiveFailures).toBe(1);
    await repo.disable('a1');
    expect((await repo.findById('a1'))?.enabled).toBe(false);
    const at = new Date('2026-09-25T10:00:00.000Z');
    await repo.markPublished('a1', '99', at);
    const after = await repo.findById('a1');
    expect(after?.timesPublished).toBe(1);
    expect(after?.lastPublishedAt).toBe(at);
    await repo.delete('a1');
    expect(await repo.findById('a1')).toBeNull();
  });
});

describe('LocalSchedulingMediaStorageAdapter', () => {
  it('stores per-post files under ads/ and library files under ads-library/', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sched-store-'));
    process.env.FEED_PUBLISHER_UPLOADS_ROOT = root;
    const storage = new LocalSchedulingMediaStorageAdapter();
    const perPost = await storage.store('a1', Buffer.from('img'), 'image/png');
    expect(perPost.relativePath.startsWith('ads/')).toBe(true);
    expect(perPost.relativePath.endsWith('.png')).toBe(true);
    const library = await storage.storeLibraryFile(
      Buffer.from('img'),
      'image/png',
      'abc123',
    );
    expect(library.relativePath).toBe('ads-library/abc123.png');
    expect(await storage.readFile(perPost.relativePath)).toEqual(
      Buffer.from('img'),
    );
  });

  it('removes missing files quietly and guards traversal', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sched-store-'));
    process.env.FEED_PUBLISHER_UPLOADS_ROOT = root;
    const storage = new LocalSchedulingMediaStorageAdapter();
    await expect(storage.remove('ads/ghost.png')).resolves.toBeUndefined();
    await expect(storage.remove('../escape.png')).rejects.toThrow(DomainError);
    await expect(storage.remove('/absolute.png')).rejects.toThrow(DomainError);
  });
});
