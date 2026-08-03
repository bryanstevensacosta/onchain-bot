import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import type { Request, Response } from 'express';
import { QueueController } from './queue.controller';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';

describe('QueueController', () => {
  let controller: QueueController;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;
  let sourceRepo: jest.Mocked<CryptoNewsSourceRepository>;

  const makeEntry = (
    status: 'PENDING' | 'PUBLISHED' = 'PENDING',
    imagePath: string | null = null,
  ): PublisherQueueEntry => {
    const entry = PublisherQueueEntry.create({
      channelId: 'crypto-news',
      messageId: 1,
      rawContent: 'body',
      rawTitle: 'title',
      imagePath,
      groupedId: null,
      messageReceivedAt: new Date(),
    });
    if (status === 'PUBLISHED') {
      entry.markScheduled(new Date());
      entry.markPublished('tg-1');
    }
    return entry;
  };

  interface MockResponse {
    res: Response;
    json: jest.Mock;
    send: jest.Mock;
    setHeader: jest.Mock;
    status: jest.Mock;
  }
  const makeRes = (): MockResponse => {
    const json = jest.fn();
    const send = jest.fn();
    const setHeader = jest.fn();
    const status = jest.fn().mockReturnThis();
    const res = { status, setHeader, send, json } as unknown as Response;
    return { res, json, send, setHeader, status };
  };

  const makeReq = (range?: string): Request =>
    ({ headers: range ? { range } : {} }) as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              publishing: {
                cryptoNews: {
                  outputChannel: '',
                },
              },
            }),
          },
        },
        {
          provide: PublisherQueueRepository,
          useValue: {
            findAllForDisplay: jest.fn(),
            findNextPending: jest.fn(),
            enqueue: jest.fn(),
            markPublished: jest.fn(),
            markFailed: jest.fn(),
            incrementAttempts: jest.fn(),
            countPublishedToday: jest.fn(),
            findById: jest.fn(),
            findByIdForDisplay: jest.fn(),
          },
        },
        {
          provide: LlmConfigRepository,
          useValue: {
            load: jest.fn().mockResolvedValue({
              targetChannel: '@crypto-news-test',
              dailyCap: 36,
              dailyResetUtcHour: 4,
              randomDelayMinMs: 180000,
              randomDelayMaxMs: 900000,
              llmMaxAttempts: 3,
              enabled: true,
            }),
            save: jest.fn(),
          },
        },
        {
          provide: CryptoNewsSourceRepository,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<QueueController>(QueueController);
    queueRepo = module.get(PublisherQueueRepository);
    sourceRepo = module.get(CryptoNewsSourceRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('should return entries mapped to views', async () => {
      const entries = [makeEntry(), makeEntry()];
      queueRepo.findAllForDisplay.mockResolvedValue(entries);

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('PENDING');
      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(50);
    });

    it('should clamp the limit to a maximum of 500', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);

      await controller.list('99999');

      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(500);
    });

    it('should clamp the limit to a minimum of 1', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);

      await controller.list('0');

      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(1);
    });

    it('should default to 50 when no limit is given', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);

      await controller.list();

      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(50);
    });
  });

  describe('counts', () => {
    it('should return counts with remaining = cap - published', async () => {
      const pendingEntries = [makeEntry(), makeEntry(), makeEntry()];
      queueRepo.findAllForDisplay.mockResolvedValue(pendingEntries);
      queueRepo.countPublishedToday.mockResolvedValue(10);

      const result = await controller.counts();

      expect(result.pending).toBe(3);
      expect(result.publishedToday).toBe(10);
      expect(result.dailyCap).toBe(36);
      expect(result.remaining).toBe(26);
    });

    it('should not let remaining go below zero', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);
      queueRepo.countPublishedToday.mockResolvedValue(50);

      const result = await controller.counts();

      expect(result.remaining).toBe(0);
    });
  });

  describe('list (displayName cascade)', () => {
    const makeEntryWithChannelId = (channelId: string): PublisherQueueEntry =>
      PublisherQueueEntry.create({
        channelId,
        messageId: 1,
        rawContent: 'body',
        rawTitle: 'title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });

    const makeSource = (
      channelId: string,
      handle: string | null,
      title: string,
    ): CryptoNewsSource =>
      CryptoNewsSource.create({ channelId, handle, title });

    it('strips leading @ from handle', async () => {
      const entry = makeEntryWithChannelId('4466661332');
      queueRepo.findAllForDisplay.mockResolvedValue([entry]);
      sourceRepo.findAll.mockResolvedValue([
        makeSource('4466661332', '@coinmarket', 'Crypto Insider'),
      ]);

      const result = await controller.list();

      expect(result[0].displayName).toBe('coinmarket');
    });

    it('uses bare handle as-is when no leading @', async () => {
      const entry = makeEntryWithChannelId('4466661332');
      queueRepo.findAllForDisplay.mockResolvedValue([entry]);
      sourceRepo.findAll.mockResolvedValue([
        makeSource('4466661332', 'coinmarket', 'Crypto Insider'),
      ]);

      const result = await controller.list();

      expect(result[0].displayName).toBe('coinmarket');
    });

    it('falls back to title when handle is null', async () => {
      const entry = makeEntryWithChannelId('4466661332');
      queueRepo.findAllForDisplay.mockResolvedValue([entry]);
      sourceRepo.findAll.mockResolvedValue([
        makeSource('4466661332', null, 'Crypto Insider'),
      ]);

      const result = await controller.list();

      expect(result[0].displayName).toBe('Crypto Insider');
    });

    it('falls back to channelId when both handle and title are unavailable', async () => {
      const entry = makeEntryWithChannelId('4466661332');
      queueRepo.findAllForDisplay.mockResolvedValue([entry]);
      sourceRepo.findAll.mockResolvedValue([]);

      const result = await controller.list();

      expect(result[0].displayName).toBe('4466661332');
    });
  });

  describe('getQueueMedia', () => {
    it('should return 404 when the entry is not found', async () => {
      queueRepo.findByIdForDisplay.mockResolvedValue(null);
      const { res, json } = makeRes();

      await controller.getQueueMedia('missing', makeReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Entry not found' });
    });

    it('should return 404 when the entry has no imagePath', async () => {
      queueRepo.findByIdForDisplay.mockResolvedValue(
        makeEntry('PENDING', null),
      );
      const { res, json } = makeRes();

      await controller.getQueueMedia('abc', makeReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Media not found' });
    });

    it('should return the file with the correct headers when the file is readable', async () => {
      const entry = makeEntry('PENDING', '/tmp/photo.jpg');
      queueRepo.findByIdForDisplay.mockResolvedValue(entry);
      const fileBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockResolvedValue(fileBuffer);
      const { res, send, setHeader } = makeRes();

      try {
        await controller.getQueueMedia('abc', makeReq(), res);

        expect(readFileSpy).toHaveBeenCalledWith('/tmp/photo.jpg');
        expect(setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
        expect(setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
        expect(setHeader).toHaveBeenCalledWith(
          'Content-Length',
          fileBuffer.length.toString(),
        );
        expect(setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'public, max-age=86400',
        );
        expect(send).toHaveBeenCalledWith(fileBuffer);
        expect(res.status).toHaveBeenCalledWith(200);
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it('should map common image extensions to their MIME type', async () => {
      const cases: ReadonlyArray<{ path: string; mime: string }> = [
        { path: '/tmp/a.png', mime: 'image/png' },
        { path: '/tmp/a.gif', mime: 'image/gif' },
        { path: '/tmp/a.webp', mime: 'image/webp' },
        { path: '/tmp/a.JPEG', mime: 'image/jpeg' },
      ];

      for (const { path, mime } of cases) {
        const entry = makeEntry('PENDING', path);
        queueRepo.findByIdForDisplay.mockResolvedValue(entry);
        const readFileSpy = jest
          .spyOn(fs.promises, 'readFile')
          .mockResolvedValue(Buffer.from('x'));
        const { res, setHeader, send } = makeRes();

        try {
          await controller.getQueueMedia('abc', makeReq(), res);
          expect(setHeader).toHaveBeenCalledWith('Content-Type', mime);
          expect(send).toHaveBeenCalled();
        } finally {
          readFileSpy.mockRestore();
        }
      }
    });

    it('should fall back to application/octet-stream for unknown extensions', async () => {
      const entry = makeEntry('PENDING', '/tmp/photo.xyz');
      queueRepo.findByIdForDisplay.mockResolvedValue(entry);
      const readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockResolvedValue(Buffer.from('x'));
      const { res, setHeader, send } = makeRes();

      try {
        await controller.getQueueMedia('abc', makeReq(), res);
        expect(setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'application/octet-stream',
        );
        expect(send).toHaveBeenCalled();
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it('should serve a .bin MP4 as video/mp4 via magic-byte sniffing', async () => {
      const entry = makeEntry('PENDING', '/tmp/video.bin');
      queueRepo.findByIdForDisplay.mockResolvedValue(entry);
      const mp4 = Buffer.alloc(16);
      mp4.writeUInt32BE(16, 0);
      mp4.write('ftyp', 4);
      mp4.write('isom', 8);
      const readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockResolvedValue(mp4);
      const { res, setHeader, send } = makeRes();

      try {
        await controller.getQueueMedia('abc', makeReq(), res);
        expect(setHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
        expect(send).toHaveBeenCalledWith(mp4);
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it('should honour a Range request with 206 and a partial body', async () => {
      const entry = makeEntry('PENDING', '/tmp/video.bin');
      queueRepo.findByIdForDisplay.mockResolvedValue(entry);
      const mp4 = Buffer.from('0123456789'); // 10 bytes
      const readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockResolvedValue(mp4);
      const { res, setHeader, send, status } = makeRes();

      try {
        await controller.getQueueMedia('abc', makeReq('bytes=2-5'), res);

        expect(status).toHaveBeenCalledWith(206);
        expect(setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 2-5/10');
        expect(send).toHaveBeenCalledWith(Buffer.from('2345'));
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it('should return 404 when the file is missing on disk', async () => {
      const entry = makeEntry('PENDING', '/tmp/missing.jpg');
      queueRepo.findByIdForDisplay.mockResolvedValue(entry);
      const enoent = Object.assign(new Error('nope'), { code: 'ENOENT' });
      const readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockRejectedValue(enoent);
      const { res, json, send } = makeRes();

      try {
        await controller.getQueueMedia('abc', makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(json).toHaveBeenCalledWith({
          error: 'Media file missing on disk',
        });
        expect(send).not.toHaveBeenCalled();
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it('should rethrow non-ENOENT read errors', async () => {
      const entry = makeEntry('PENDING', '/tmp/photo.jpg');
      queueRepo.findByIdForDisplay.mockResolvedValue(entry);
      const otherErr = new Error('EACCES');
      const readFileSpy = jest
        .spyOn(fs.promises, 'readFile')
        .mockRejectedValue(otherErr);
      const { res } = makeRes();

      try {
        await expect(
          controller.getQueueMedia('abc', makeReq(), res),
        ).rejects.toBe(otherErr);
      } finally {
        readFileSpy.mockRestore();
      }
    });
  });
});
