import { Test, TestingModule } from '@nestjs/testing';
import { TelegramMediaExtractorService } from './telegram-media-extractor.service';
import { MediaDownloaderService } from 'media/application/services/media-downloader.service';
import { Api } from 'telegram';

describe('TelegramMediaExtractorService', () => {
  let service: TelegramMediaExtractorService;
  let mockDownloader: jest.Mocked<MediaDownloaderService>;
  let mockClient: any;

  beforeEach(async () => {
    mockDownloader = {
      download: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramMediaExtractorService,
        {
          provide: MediaDownloaderService,
          useValue: mockDownloader,
        },
      ],
    }).compile();

    service = module.get<TelegramMediaExtractorService>(
      TelegramMediaExtractorService,
    );
    mockClient = {};
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractAndDownload', () => {
    it('should return undefined for null media', async () => {
      const result = await service.extractAndDownload(
        mockClient,
        '-1001234567890',
        1,
        null,
      );

      expect(result).toBeUndefined();
      expect(mockDownloader.download).not.toHaveBeenCalled();
    });

    it('should download and return photo attachment', async () => {
      const photoMedia = {
        photo: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          dcId: 2,
          date: 1609459200,
        },
      };
      Object.setPrototypeOf(photoMedia, Api.MessageMediaPhoto.prototype);

      mockDownloader.download.mockResolvedValue({
        filePath: '/uploads/crypto-news/media/channel/1_0.jpg',
        mimeType: 'image/jpeg',
        fileSize: 12345,
      });

      const result = await service.extractAndDownload(
        mockClient,
        '-1001234567890',
        1,
        photoMedia,
      );

      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        type: 'photo',
        index: 0,
        fileId: '123',
        accessHash: '456',
        filePath: '/uploads/crypto-news/media/channel/1_0.jpg',
        mimeType: 'image/jpeg',
        fileSize: 12345,
        dcId: 2,
        date: 1609459200,
      });
      expect(mockDownloader.download).toHaveBeenCalledWith(
        mockClient,
        '-1001234567890',
        1,
        0,
        photoMedia,
      );
    });

    it('should download and return video document attachment', async () => {
      const videoDoc = {
        id: BigInt(789),
        accessHash: BigInt(101112),
        fileReference: Buffer.from('vidref'),
        mimeType: 'video/mp4',
        dcId: 4,
        date: 1609459300,
      };
      const docMedia = {
        document: videoDoc,
      };
      Object.setPrototypeOf(docMedia, Api.MessageMediaDocument.prototype);

      mockDownloader.download.mockResolvedValue({
        filePath: '/uploads/crypto-news/media/channel/2_0.mp4',
        mimeType: 'video/mp4',
        fileSize: 54321,
      });

      const result = await service.extractAndDownload(
        mockClient,
        '-1001234567890',
        2,
        docMedia,
      );

      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        type: 'video',
        index: 0,
        fileId: '789',
        accessHash: '101112',
        filePath: '/uploads/crypto-news/media/channel/2_0.mp4',
        mimeType: 'video/mp4',
        fileSize: 54321,
        dcId: 4,
        date: 1609459300,
      });
    });

    it('should skip non-video documents', async () => {
      const pdfDoc = {
        id: BigInt(789),
        accessHash: BigInt(101112),
        fileReference: Buffer.from('pdfref'),
        mimeType: 'application/pdf',
        dcId: 4,
        date: 1609459300,
      };
      const docMedia = {
        document: pdfDoc,
      };
      Object.setPrototypeOf(docMedia, Api.MessageMediaDocument.prototype);

      const result = await service.extractAndDownload(
        mockClient,
        '-1001234567890',
        3,
        docMedia,
      );

      expect(result).toBeUndefined();
      expect(mockDownloader.download).not.toHaveBeenCalled();
    });

    it('should return undefined for document without document field', async () => {
      const docMedia = {
        document: null,
      };
      Object.setPrototypeOf(docMedia, Api.MessageMediaDocument.prototype);

      const result = await service.extractAndDownload(
        mockClient,
        '-1001234567890',
        4,
        docMedia,
      );

      expect(result).toBeUndefined();
      expect(mockDownloader.download).not.toHaveBeenCalled();
    });

    it('should throw error on download failure', async () => {
      const photoMedia = {
        photo: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          dcId: 2,
          date: 1609459200,
        },
      };
      Object.setPrototypeOf(photoMedia, Api.MessageMediaPhoto.prototype);

      mockDownloader.download.mockRejectedValue(new Error('Network error'));

      await expect(
        service.extractAndDownload(mockClient, '-1001234567890', 5, photoMedia),
      ).rejects.toThrow('Network error');
    });
  });
});
