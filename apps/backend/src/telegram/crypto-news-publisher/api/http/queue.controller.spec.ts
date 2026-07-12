import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import type { Response } from 'express';
import { QueueController } from './queue.controller';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

describe('QueueController', () => {
  let controller: QueueController;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;

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
  }
  const makeRes = (): MockResponse => {
    const json = jest.fn();
    const send = jest.fn();
    const setHeader = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status, setHeader, send } as unknown as Response;
    return { res, json, send, setHeader };
  };

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
      ],
    }).compile();

    controller = module.get<QueueController>(QueueController);
    queueRepo = module.get(PublisherQueueRepository);
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

  describe('getQueueMedia', () => {
    it('should return 404 when the entry is not found', async () => {
      queueRepo.findByIdForDisplay.mockResolvedValue(null);
      const { res, json } = makeRes();

      await controller.getQueueMedia('missing', res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Media not found' });
    });

    it('should return 404 when the entry has no imagePath', async () => {
      queueRepo.findByIdForDisplay.mockResolvedValue(
        makeEntry('PENDING', null),
      );
      const { res, json } = makeRes();

      await controller.getQueueMedia('abc', res);

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
        await controller.getQueueMedia('abc', res);

        expect(readFileSpy).toHaveBeenCalledWith('/tmp/photo.jpg');
        expect(setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
        expect(setHeader).toHaveBeenCalledWith(
          'Content-Length',
          fileBuffer.length.toString(),
        );
        expect(setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'public, max-age=86400',
        );
        expect(send).toHaveBeenCalledWith(fileBuffer);
        expect(res.status).not.toHaveBeenCalled();
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
          await controller.getQueueMedia('abc', res);
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
        await controller.getQueueMedia('abc', res);
        expect(setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'application/octet-stream',
        );
        expect(send).toHaveBeenCalled();
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
        await controller.getQueueMedia('abc', res);

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
        await expect(controller.getQueueMedia('abc', res)).rejects.toBe(
          otherErr,
        );
      } finally {
        readFileSpy.mockRestore();
      }
    });
  });
});
