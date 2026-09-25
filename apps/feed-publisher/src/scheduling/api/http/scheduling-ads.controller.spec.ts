import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { SchedulingAdsController } from './scheduling-ads.controller';
import { UploadScheduledAdMediaUseCase } from '../../application/use-cases/upload-scheduled-ad-media.use-case';
import { ClearScheduledAdMediaUseCase } from '../../application/use-cases/clear-scheduled-ad-media.use-case';
import { ReuseLibraryMediaUseCase } from '../../application/use-cases/reuse-library-media.use-case';
import { PublishScheduledAdNowUseCase } from '../../application/use-cases/publish-scheduled-ad-now.use-case';
import { SchedulingHealthState } from '../../application/state/scheduling-health.state';
import { InMemoryScheduledAdRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemoryScheduledAdMediaRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad-media.repository';
import { InMemoryAdMediaLibraryRepository } from '../../infrastructure/persistence/in-memory/in-memory-ad-media-library.repository';
import { InMemorySchedulingStateRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-state.repository';
import { LocalSchedulingMediaStorageAdapter } from '../../infrastructure/storage/local-scheduling-media-storage.adapter';
import { InMemoryScheduledAdDispatcher } from '../../infrastructure/dispatch/in-memory-scheduled-ad.dispatcher';

async function makeHarness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sched-ads-ctrl-'));
  process.env.FEED_PUBLISHER_UPLOADS_ROOT = root;
  const adRepo = new InMemoryScheduledAdRepository();
  const adMediaRepo = new InMemoryScheduledAdMediaRepository();
  const libraryRepo = new InMemoryAdMediaLibraryRepository();
  const stateRepo = new InMemorySchedulingStateRepository();
  const storage = new LocalSchedulingMediaStorageAdapter();
  const dispatcher = new InMemoryScheduledAdDispatcher();
  const health = new SchedulingHealthState();
  const controller = new SchedulingAdsController(
    adRepo,
    adMediaRepo,
    storage,
    new UploadScheduledAdMediaUseCase(
      adRepo,
      adMediaRepo,
      libraryRepo,
      storage,
    ),
    new ClearScheduledAdMediaUseCase(adRepo, adMediaRepo, storage),
    new ReuseLibraryMediaUseCase(adRepo, libraryRepo),
    new PublishScheduledAdNowUseCase(adRepo, stateRepo, dispatcher, health),
  );
  return { adRepo, dispatcher, controller };
}

describe('SchedulingAdsController', () => {
  it('lists posts in catalog order', async () => {
    const { adRepo, controller } = await makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'b', name: 'b-post', body: 'b', order: 5 }),
    );
    await adRepo.save(
      ScheduledAd.create({ id: 'a', name: 'a-post', body: 'a', order: 1 }),
    );
    const list = await controller.list();
    expect(list.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('creates posts with auto-increment order and 409s duplicate names', async () => {
    const { controller } = await makeHarness();
    const first = await controller.create({ name: 'promo', body: 'hello' });
    expect(first.order).toBe(0);
    const second = await controller.create({ name: 'other', body: 'hi' });
    expect(second.order).toBe(1);
    await expect(
      controller.create({ name: 'promo', body: 'dup' }),
    ).rejects.toThrow(ConflictException);
  });

  it('patches posts and 404s unknown or malformed ids', async () => {
    const { controller } = await makeHarness();
    const created = await controller.create({ name: 'promo', body: 'hello' });
    const updated = await controller.update(created.id, { body: 'edited' });
    expect(updated.body).toBe('edited');
    await expect(
      controller.update('00000000-0000-0000-0000-000000000000', { body: 'x' }),
    ).rejects.toThrow(NotFoundException);
    await expect(controller.update('nope', { body: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('publishes now to telegram by default and threads on request', async () => {
    const { controller, dispatcher } = await makeHarness();
    const created = await controller.create({ name: 'promo', body: 'hello' });
    const telegram = await controller.publishNow(created.id, {});
    expect(telegram.ok).toBe(true);
    const threads = await controller.publishNow(created.id, {
      target: 'threads',
    });
    expect(threads.ok).toBe(true);
    expect(dispatcher.publishedTo('telegram')).toHaveLength(1);
    expect(dispatcher.publishedTo('threads')).toHaveLength(1);
  });

  it('deletes posts with their media files', async () => {
    const { adRepo, controller } = await makeHarness();
    const created = await controller.create({ name: 'promo', body: 'hello' });
    await controller.remove(created.id);
    expect(await adRepo.findById(created.id)).toBeNull();
    await expect(controller.remove(created.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
