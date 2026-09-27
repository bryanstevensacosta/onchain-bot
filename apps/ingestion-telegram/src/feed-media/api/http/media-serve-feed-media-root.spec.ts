import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { MediaController } from './media.controller';

/**
 * Serve-by-glob from the unified on-disk home (`{UPLOADS_ROOT}/feed-media`)
 * with rollout fallback to the legacy segments (`feed/media`,
 * `crypto-news/media`).
 *
 * Uses a real temp uploads tree (no mocks of the filesystem): proves that
 * `GET /api/media/:channelId/:messageId/:index` serves bytes from the new
 * home directly (no fallback log), still serves a file left behind under a
 * legacy segment via fallback (200 + one `media:serve:fallback` log hit),
 * and keeps 400/404/cache semantics unchanged.
 */
describe('MediaController serve-by-glob (feed-media root)', () => {
  const channelId = '-1001234567890';
  const messageId = 167;
  const index = 0;
  const payload = Buffer.from('moved-feed-bytes');

  let tmpRoot: string;
  let controller: MediaController;

  const createMockResponse = () => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    const res = Object.assign(sink, {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    }) as unknown as Response & { chunks: Buffer[] };
    (res as unknown as { chunks: Buffer[] }).chunks = chunks;
    return { res, chunks, sink };
  };

  const waitFinished = (sink: PassThrough): Promise<void> =>
    new Promise((resolve) => {
      if (sink.writableFinished) {
        resolve();
        return;
      }
      sink.on('finish', () => resolve());
    });

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'feed-media-'));
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({ uploads: { root: tmpRoot } }),
          },
        },
      ],
    }).compile();
    controller = module.get<MediaController>(MediaController);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('serves a fixture from feed-media directly with cache headers (200 path)', async () => {
    const dir = path.join(tmpRoot, 'feed-media', channelId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${messageId}_${index}.jpg`), payload);

    const fallbackSpy = jest.spyOn(
      (controller as unknown as { logger: { warn: (...a: unknown[]) => void } })
        .logger,
      'warn',
    );
    const { res, chunks, sink } = createMockResponse();
    await controller.serveMedia(
      channelId,
      String(messageId),
      String(index),
      res,
    );
    await waitFinished(sink);

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(Buffer.concat(chunks)).toEqual(payload);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpg');
    expect(fallbackSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('media:serve:fallback'),
    );
    fallbackSpy.mockRestore();
  });

  it('resolves by {messageId}_{index}.* glob regardless of extension', async () => {
    const dir = path.join(tmpRoot, 'feed-media', channelId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${messageId}_${index}.mp4`), payload);

    const { res, chunks, sink } = createMockResponse();
    await controller.serveMedia(
      channelId,
      String(messageId),
      String(index),
      res,
    );
    await waitFinished(sink);

    expect(Buffer.concat(chunks)).toEqual(payload);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
  });

  it.each([
    ['feed', 'media'],
    ['crypto-news', 'media'],
  ])(
    'serves a file left behind under legacy %s via fallback (200 + fallback log)',
    async (...segments: string[]) => {
      const dir = path.join(tmpRoot, ...segments, channelId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${messageId}_${index}.jpg`), payload);

      const fallbackSpy = jest.spyOn(
        (
          controller as unknown as {
            logger: { warn: (...a: unknown[]) => void };
          }
        ).logger,
        'warn',
      );
      const { res, chunks, sink } = createMockResponse();
      await controller.serveMedia(
        channelId,
        String(messageId),
        String(index),
        res,
      );
      await waitFinished(sink);

      expect(Buffer.concat(chunks)).toEqual(payload);
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(fallbackSpy).toHaveBeenCalledWith(
        expect.stringContaining('media:serve:fallback'),
      );
      fallbackSpy.mockRestore();
    },
  );

  it('returns 404 when the file exists in neither home nor legacy roots', async () => {
    const { res } = createMockResponse();
    await controller.serveMedia(
      channelId,
      String(messageId),
      String(index),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('keeps 400 semantics for invalid params after the move', async () => {
    const { res } = createMockResponse();
    await controller.serveMedia(channelId, 'not-a-number', String(index), res);
    expect(res.status).toHaveBeenCalledWith(400);

    const { res: res2 } = createMockResponse();
    await controller.serveMedia('', String(messageId), String(index), res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });
});
