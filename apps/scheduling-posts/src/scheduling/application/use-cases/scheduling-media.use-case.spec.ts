import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { DomainError } from 'shared/kernel/domain-error';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { UploadScheduledAdMediaUseCase } from './upload-scheduled-ad-media.use-case';
import { ClearScheduledAdMediaUseCase } from './clear-scheduled-ad-media.use-case';
import { ReuseLibraryMediaUseCase } from './reuse-library-media.use-case';
import { InMemoryScheduledAdRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemoryScheduledAdMediaRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad-media.repository';
import { InMemoryAdMediaLibraryRepository } from '../../infrastructure/persistence/in-memory/in-memory-ad-media-library.repository';
import { LocalSchedulingMediaStorageAdapter } from '../../infrastructure/storage/local-scheduling-media-storage.adapter';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
]);
const TEXT = Buffer.from('not an image at all, just text bytes....');

async function makeHarness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sched-media-'));
  process.env.FEED_PUBLISHER_UPLOADS_ROOT = root;
  const adRepo = new InMemoryScheduledAdRepository();
  const adMediaRepo = new InMemoryScheduledAdMediaRepository();
  const libraryRepo = new InMemoryAdMediaLibraryRepository();
  const storage = new LocalSchedulingMediaStorageAdapter();
  const upload = new UploadScheduledAdMediaUseCase(
    adRepo,
    adMediaRepo,
    libraryRepo,
    storage,
  );
  const clear = new ClearScheduledAdMediaUseCase(adRepo, adMediaRepo, storage);
  const reuse = new ReuseLibraryMediaUseCase(adRepo, libraryRepo);
  return {
    root,
    adRepo,
    adMediaRepo,
    libraryRepo,
    storage,
    upload,
    clear,
    reuse,
  };
}

describe('scheduling media use-cases', () => {
  it('uploads an image, registers the library, and replaces cleanly', async () => {
    const { adRepo, libraryRepo, upload } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    const first = await upload.execute({
      adId: 'a1',
      kind: 'image',
      buffer: PNG,
      originalFileName: 'one.png',
    });
    expect(first.imageMediaId).not.toBeNull();
    expect(await libraryRepo.findAll()).toHaveLength(1);
    const second = await upload.execute({
      adId: 'a1',
      kind: 'image',
      buffer: Buffer.concat([PNG, Buffer.from([0x01])]),
      originalFileName: 'two.png',
    });
    expect(second.imageMediaId).not.toBe(first.imageMediaId);
    // Library dedups by content: two distinct bytes = two rows.
    expect(await libraryRepo.findAll()).toHaveLength(2);
  });

  it('reuses identical bytes from the library without a second file', async () => {
    const { adRepo, libraryRepo, upload } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await adRepo.save(
      ScheduledAd.create({ id: 'a2', name: 'two', body: 'hello' }),
    );
    await upload.execute({ adId: 'a1', kind: 'image', buffer: PNG });
    await upload.execute({ adId: 'a2', kind: 'image', buffer: PNG });
    expect(await libraryRepo.findAll()).toHaveLength(1);
  });

  it('rejects non-image bytes for images and non-video bytes for videos', async () => {
    const { adRepo, upload } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await expect(
      upload.execute({ adId: 'a1', kind: 'image', buffer: TEXT }),
    ).rejects.toThrow(DomainError);
    await expect(
      upload.execute({ adId: 'a1', kind: 'video', buffer: PNG }),
    ).rejects.toThrow(DomainError);
  });

  it('rejects empty and oversized uploads', async () => {
    const { adRepo, upload } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await expect(
      upload.execute({ adId: 'a1', kind: 'image', buffer: Buffer.alloc(0) }),
    ).rejects.toThrow(/empty file/);
    await expect(
      upload.execute({
        adId: 'a1',
        kind: 'image',
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow(/10 MB/);
  });

  it('404s on unknown posts but keeps the library bytes', async () => {
    const { libraryRepo, upload } = await makeHarness();
    await expect(
      upload.execute({ adId: 'missing', kind: 'image', buffer: PNG }),
    ).rejects.toThrow(/not found/);
    expect(await libraryRepo.findAll()).toHaveLength(1);
  });

  it('clears media and downgrades photo posts to text', async () => {
    const { adRepo, adMediaRepo, upload, clear } = await makeHarness();
    // The in-memory repo persists snapshots verbatim, so a photo post
    // can be staged here to exercise the clear downgrade path.
    const photo = ScheduledAd.fromSnapshot({
      id: 'a1',
      name: 'one',
      body: 'hello',
      format: 'photo',
      imageMediaId: null,
      videoMediaId: null,
      albumMediaIds: null,
      buttons: null,
      enabled: true,
      order: 0,
      timesPublished: 0,
      consecutiveFailures: 0,
      lastPublishedAt: null,
      expiresAt: null,
      expirationAction: 'disable',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await adRepo.save(photo);
    const withImage = await upload.execute({
      adId: 'a1',
      kind: 'image',
      buffer: PNG,
    });
    expect(withImage.imageMediaId).not.toBeNull();
    const cleared = await clear.execute('a1', 'image');
    expect(cleared.imageMediaId).toBeNull();
    expect(cleared.format).toBe('text');
    expect(
      await adMediaRepo.findById(withImage.imageMediaId as string),
    ).toBeNull();
  });

  it('uploads video and serves the library row id back', async () => {
    const { adRepo, libraryRepo, upload } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    const view = await upload.execute({
      adId: 'a1',
      kind: 'video',
      buffer: MP4,
    });
    expect(view.videoMediaId).not.toBeNull();
    expect(await libraryRepo.findAll()).toHaveLength(1);
  });

  it('reuses library assets as image (single) or album (many)', async () => {
    const { adRepo, libraryRepo, upload, reuse } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await adRepo.save(
      ScheduledAd.create({ id: 'a2', name: 'two', body: 'hello' }),
    );
    await upload.execute({ adId: 'a2', kind: 'image', buffer: PNG });
    const library = await libraryRepo.findAll();
    expect(library).toHaveLength(1);
    const single = await reuse.execute({
      adId: 'a1',
      libraryMediaIds: [library[0].id],
    });
    expect(single.imageMediaId).toBe(library[0].id);
    const album = await reuse.execute({
      adId: 'a1',
      libraryMediaIds: [library[0].id, library[0].id],
    });
    expect(album.format).toBe('album');
    expect(album.albumMediaIds).toEqual([library[0].id, library[0].id]);
    await expect(
      reuse.execute({ adId: 'a1', libraryMediaIds: [] }),
    ).rejects.toThrow(/at least one/);
  });
});
