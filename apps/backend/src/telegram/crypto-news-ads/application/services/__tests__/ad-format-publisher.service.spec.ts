import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AdFormatPublisherService } from '../ad-format-publisher.service';
import {
  Ad,
  type AdFormat,
} from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import {
  AdMediaRepository,
  type AdMediaRecord,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { TelegramPublisherPort } from 'telegram/shared';

// Mock existsSync so media-present / media-missing-from-disk branches run
// without touching real disk. jest.mock is hoisted above imports, so the
// mocked existsSync is in place before the service is required. Node
// exposes `existsSync` as a non-configurable getter — jest.spyOn cannot
// redefine it, so the partial-module-mock pattern is required (mirrors
// publish-ad.use-case.spec.ts).
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs') as unknown as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    existsSync: jest.fn(),
  };
});
const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;

const UPLOADS_ROOT = '/tmp/uploads';

describe('AdFormatPublisherService', () => {
  let service: AdFormatPublisherService;
  let warnedMessages: string[];

  const publisher = {
    sendMessage: jest.fn(),
    sendPhoto: jest.fn(),
    sendVideo: jest.fn(),
    sendMediaGroup: jest.fn(),
  } as unknown as jest.Mocked<TelegramPublisherPort>;
  const adMediaRepo = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<AdMediaRepository>;
  const config = {
    getOrThrow: jest.fn().mockReturnValue({ uploadsRoot: UPLOADS_ROOT }),
  } as unknown as ConfigService;

  beforeEach(() => {
    warnedMessages = [];
    jest.clearAllMocks();
    mockedExistsSync.mockReset();
    adMediaRepo.findById.mockReset();
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        warnedMessages.push(String(message));
      });
    service = new AdFormatPublisherService(publisher, adMediaRepo, config);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mediaRecord(
    id: string,
    filePath = `crypto-news-ads/${id}.png`,
  ): AdMediaRecord {
    return {
      id,
      adId: 'ad-1',
      filePath,
      mimeType: 'image/png',
      fileSize: 1024,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    };
  }

  describe('photo format', () => {
    it('publishes via sendPhoto with the resolved local path (parseMode HTML)', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
        format: 'photo',
        imageMediaId: 'img-1',
      });
      adMediaRepo.findById.mockResolvedValue(mediaRecord('img-1'));
      mockedExistsSync.mockReturnValue(true);

      await service.publish(ad);

      expect(publisher.sendPhoto).toHaveBeenCalledWith(
        '',
        ad.body,
        path.join(UPLOADS_ROOT, 'crypto-news-ads/img-1.png'),
        { parseMode: 'HTML' },
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });

    it('degrades to sendMessage with a no-media warn when the media row is missing', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
        format: 'photo',
        imageMediaId: 'img-1',
      });
      adMediaRepo.findById.mockResolvedValue(null);

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        { parseMode: 'HTML' },
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(warnedMessages).toContain(
        'ad ad-1 has mediaId img-1 but no media row — publishing as text',
      );
    });

    it('degrades to sendMessage with a file-missing warn when the file is not on disk', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
        format: 'photo',
        imageMediaId: 'img-1',
      });
      adMediaRepo.findById.mockResolvedValue(mediaRecord('img-1'));
      mockedExistsSync.mockReturnValue(false);

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        { parseMode: 'HTML' },
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(warnedMessages).toContain(
        `ad ad-1 media file missing at ${path.join(UPLOADS_ROOT, 'crypto-news-ads/img-1.png')} — publishing as text`,
      );
    });
  });

  describe('video format', () => {
    it('publishes via sendVideo with supportsStreaming true', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
        format: 'video',
        videoMediaId: 'vid-1',
      });
      adMediaRepo.findById.mockResolvedValue(
        mediaRecord('vid-1', 'crypto-news-ads/vid-1.mp4'),
      );
      mockedExistsSync.mockReturnValue(true);

      await service.publish(ad);

      expect(publisher.sendVideo).toHaveBeenCalledWith(
        '',
        ad.body,
        path.join(UPLOADS_ROOT, 'crypto-news-ads/vid-1.mp4'),
        { parseMode: 'HTML', supportsStreaming: true },
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });

    it('degrades to sendMessage when the video media row is missing', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
        format: 'video',
        videoMediaId: 'vid-1',
      });
      adMediaRepo.findById.mockResolvedValue(null);

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        { parseMode: 'HTML' },
      );
      expect(publisher.sendVideo).not.toHaveBeenCalled();
      expect(warnedMessages).toContain(
        'ad ad-1 has mediaId vid-1 but no media row — publishing as text',
      );
    });
  });

  describe('album format', () => {
    it('publishes via sendMediaGroup with all resolved paths (parseMode HTML)', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'gallery',
        format: 'album',
        albumMediaIds: ['img-1', 'img-2'],
      });
      adMediaRepo.findById.mockImplementation(async (id) =>
        mediaRecord(String(id)),
      );
      mockedExistsSync.mockReturnValue(true);

      await service.publish(ad);

      expect(publisher.sendMediaGroup).toHaveBeenCalledWith(
        '',
        ad.body,
        [
          path.join(UPLOADS_ROOT, 'crypto-news-ads/img-1.png'),
          path.join(UPLOADS_ROOT, 'crypto-news-ads/img-2.png'),
        ],
        { parseMode: 'HTML' },
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });

    it('skips the album with a {ok:false} result (not a throw) when a media row is missing', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'gallery',
        format: 'album',
        albumMediaIds: ['img-1', 'img-missing'],
      });
      adMediaRepo.findById.mockImplementation(async (id) =>
        id === 'img-missing' ? null : mediaRecord(String(id)),
      );
      mockedExistsSync.mockReturnValue(true);

      const result = await service.publish(ad);

      expect(result).toEqual({
        ok: false,
        messageId: null,
        error: 'ad ad-1 album media missing — skipping',
      });
      expect(publisher.sendMediaGroup).not.toHaveBeenCalled();
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });

    it('skips the album with a {ok:false} result when a media file is missing on disk', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'gallery',
        format: 'album',
        albumMediaIds: ['img-1', 'img-2'],
      });
      adMediaRepo.findById.mockImplementation(async (id) =>
        mediaRecord(String(id)),
      );
      mockedExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

      const result = await service.publish(ad);

      expect(result).toEqual({
        ok: false,
        messageId: null,
        error: 'ad ad-1 album media missing — skipping',
      });
      expect(publisher.sendMediaGroup).not.toHaveBeenCalled();
    });
  });

  describe('text format', () => {
    it('publishes pure text — imageMediaId is ignored, no media repo access', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
        imageMediaId: 'img-1',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        { parseMode: 'HTML' },
      );
      expect(adMediaRepo.findById).not.toHaveBeenCalled();
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
    });
  });

  describe('default branch', () => {
    it('falls back to sendMessage for an unknown format', async () => {
      const base = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'body',
      });
      const ad = Ad.fromSnapshot({
        id: base.id,
        name: base.name,
        body: base.body,
        imageMediaId: base.imageMediaId,
        enabled: base.enabled,
        order: base.order,
        timesPublished: base.timesPublished,
        consecutiveFailures: base.consecutiveFailures,
        lastPublishedAt: base.lastPublishedAt,
        expiresAt: base.expiresAt,
        expirationAction: base.expirationAction,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        format: 'unknown' as unknown as AdFormat,
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        { parseMode: 'HTML' },
      );
      expect(adMediaRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('inline keyboard from body anchor', () => {
    it('attaches a single-button inline keyboard built from the first <a href> anchor', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'Join now: <a href="https://ourbit.com/ref?agent=1">Click aquí</a>',
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        {
          parseMode: 'HTML',
          replyMarkup: [
            [{ text: 'Click aquí', url: 'https://ourbit.com/ref?agent=1' }],
          ],
        },
      );
    });

    it('uses the full anchor URL even when it contains query params', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: '<a href="https://ourbit.com/activity/kol?id=0dbd&agent=7760&inviteCode=MJ77J5">Regístrate</a>',
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        {
          parseMode: 'HTML',
          replyMarkup: [
            [
              {
                text: 'Regístrate',
                url: 'https://ourbit.com/activity/kol?id=0dbd&agent=7760&inviteCode=MJ77J5',
              },
            ],
          ],
        },
      );
    });

    it('publishes without replyMarkup when the body has no anchor', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'no link here',
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        { parseMode: 'HTML' },
      );
    });

    it('propagates the keyboard to sendPhoto when the format is photo', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: '<a href="https://ourbit.com/ref">Abrir</a>',
        format: 'photo',
        imageMediaId: 'img-1',
      });
      adMediaRepo.findById.mockResolvedValue(mediaRecord('img-1'));
      mockedExistsSync.mockReturnValue(true);

      await service.publish(ad);

      expect(publisher.sendPhoto).toHaveBeenCalledWith(
        '',
        ad.body,
        path.join(UPLOADS_ROOT, 'crypto-news-ads/img-1.png'),
        {
          parseMode: 'HTML',
          replyMarkup: [[{ text: 'Abrir', url: 'https://ourbit.com/ref' }]],
        },
      );
    });

    it('turns every anchor into a button (2 anchors share one row)', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: '<a href="https://ourbit.com/ref">Abrir</a> <a href="https://t.me/ourbit">Canal</a>',
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        {
          parseMode: 'HTML',
          replyMarkup: [
            [
              { text: 'Abrir', url: 'https://ourbit.com/ref' },
              { text: 'Canal', url: 'https://t.me/ourbit' },
            ],
          ],
        },
      );
    });

    it('groups buttons into rows of 3', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: '<a href="https://ourbit.com/1">Uno</a> <a href="https://ourbit.com/2">Dos</a> <a href="https://ourbit.com/3">Tres</a> <a href="https://ourbit.com/4">Cuatro</a>',
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        {
          parseMode: 'HTML',
          replyMarkup: [
            [
              { text: 'Uno', url: 'https://ourbit.com/1' },
              { text: 'Dos', url: 'https://ourbit.com/2' },
              { text: 'Tres', url: 'https://ourbit.com/3' },
            ],
            [{ text: 'Cuatro', url: 'https://ourbit.com/4' }],
          ],
        },
      );
    });

    it('caps the keyboard at 6 buttons, ignoring further anchors', async () => {
      const anchors = Array.from(
        { length: 8 },
        (_, i) => `<a href="https://ourbit.com/${i + 1}">B${i + 1}</a>`,
      ).join(' ');
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: anchors,
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        {
          parseMode: 'HTML',
          replyMarkup: [
            [
              { text: 'B1', url: 'https://ourbit.com/1' },
              { text: 'B2', url: 'https://ourbit.com/2' },
              { text: 'B3', url: 'https://ourbit.com/3' },
            ],
            [
              { text: 'B4', url: 'https://ourbit.com/4' },
              { text: 'B5', url: 'https://ourbit.com/5' },
              { text: 'B6', url: 'https://ourbit.com/6' },
            ],
          ],
        },
      );
    });

    it("falls back to 'Abrir' label for an empty anchor text", async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: '<a href="https://x.com"></a>',
        format: 'text',
      });

      await service.publish(ad);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        ad.body,
        undefined,
        {
          parseMode: 'HTML',
          replyMarkup: [[{ text: 'Abrir', url: 'https://x.com' }]],
        },
      );
    });
  });
});
