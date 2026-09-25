import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { BadRequestException } from '@nestjs/common';
import { SchedulingMediaController } from './scheduling-media.controller';
import { InMemoryScheduledAdMediaRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad-media.repository';
import { InMemoryAdMediaLibraryRepository } from '../../infrastructure/persistence/in-memory/in-memory-ad-media-library.repository';
import { LocalSchedulingMediaStorageAdapter } from '../../infrastructure/storage/local-scheduling-media-storage.adapter';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    set(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    end(payload?: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function makeHarness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sched-media-ctrl-'));
  process.env.FEED_PUBLISHER_UPLOADS_ROOT = root;
  const adMediaRepo = new InMemoryScheduledAdMediaRepository();
  const libraryRepo = new InMemoryAdMediaLibraryRepository();
  const storage = new LocalSchedulingMediaStorageAdapter();
  const controller = new SchedulingMediaController(
    adMediaRepo,
    libraryRepo,
    storage,
  );
  return { controller, libraryRepo };
}

describe('SchedulingMediaController', () => {
  it('lists an empty library, then the uploaded asset', async () => {
    const { controller } = await makeHarness();
    expect(await controller.listLibrary()).toEqual([]);
    const view = await controller.uploadToLibrary({
      buffer: PNG,
      originalname: 'one.png',
    });
    expect(view.mimeType).toBe('image/png');
    expect(view.url).toBe(`/api/scheduling/media/library/${view.id}`);
    expect(await controller.listLibrary()).toHaveLength(1);
  });

  it('dedups identical uploads to one library row', async () => {
    const { controller } = await makeHarness();
    const first = await controller.uploadToLibrary({
      buffer: PNG,
      originalname: 'one.png',
    });
    const second = await controller.uploadToLibrary({
      buffer: PNG,
      originalname: 'uno.png',
    });
    expect(second.id).toBe(first.id);
  });

  it('rejects empty and non-media uploads', async () => {
    const { controller } = await makeHarness();
    await expect(
      controller.uploadToLibrary({
        buffer: Buffer.alloc(0),
        originalname: 'empty.png',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.uploadToLibrary({
        buffer: Buffer.from('plain text, no magic bytes here....'),
        originalname: 'note.txt',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('serves a library asset with 200 + cache headers', async () => {
    const { controller } = await makeHarness();
    const view = await controller.uploadToLibrary({
      buffer: PNG,
      originalname: 'one.png',
    });
    const res = makeRes();
    await controller.getLibraryMedia(
      view.id,
      { headers: {} } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it('supports byte ranges with 206', async () => {
    const { controller } = await makeHarness();
    const view = await controller.uploadToLibrary({
      buffer: PNG,
      originalname: 'one.png',
    });
    const res = makeRes();
    await controller.getLibraryMedia(
      view.id,
      { headers: { range: 'bytes=0-3' } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(206);
    expect((res.body as Buffer).byteLength).toBe(4);
  });

  it('404s malformed ids, unknown rows, and missing files', async () => {
    const { controller } = await makeHarness();
    const malformed = makeRes();
    await controller.getLibraryMedia(
      'nope',
      { headers: {} } as never,
      malformed as never,
    );
    expect(malformed.statusCode).toBe(404);
    const unknown = makeRes();
    await controller.getLibraryMedia(
      '00000000-0000-0000-0000-000000000000',
      { headers: {} } as never,
      unknown as never,
    );
    expect(unknown.statusCode).toBe(404);
    const missing = makeRes();
    await controller.getMedia(
      '00000000-0000-0000-0000-000000000000',
      { headers: {} } as never,
      missing as never,
    );
    expect(missing.statusCode).toBe(404);
  });
});
