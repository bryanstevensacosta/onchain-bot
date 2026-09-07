import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { MediaController } from './media.controller';
import { promises as fs } from 'fs';
import type { Response } from 'express';
import { Readable } from 'stream';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    stat: jest.fn(),
  },
  createReadStream: jest.fn(),
}));

/**
 * Unit tests for MediaController
 *
 * **Validates: Requirements 4.2, 4.3, 4.5**
 *
 * Tests media serving functionality:
 * - File serving with correct headers (Content-Type, Content-Length, ETag, Cache-Control)
 * - 404 for missing files
 * - MIME type detection
 * - Caching headers (public, max-age=31536000)
 * - File streaming via createReadStream
 * - Edge cases (invalid params, race conditions, stream errors)
 */
describe('MediaController', () => {
  let controller: MediaController;
  let configService: ConfigService;

  // Get mocked functions
  const mockReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
  const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;
  const mockCreateReadStream = jest.requireMock('fs').createReadStream;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Set default mock implementations
    mockReaddir.mockResolvedValue([]);
    mockStat.mockResolvedValue({
      size: 1024,
      mtime: new Date('2026-08-30T00:00:00Z'),
    } as any);
    mockCreateReadStream.mockReturnValue({
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              uploads: {
                root: '/test/uploads',
              },
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<MediaController>(MediaController);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('serveMedia', () => {
    it('should serve media file with correct headers (Requirement 4.2, 4.5)', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 2048,
        mtime: new Date('2026-08-30T12:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert - Verify headers
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'image/jpeg',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        2048,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'ETag',
        expect.stringMatching(/^".*"$/),
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=31536000',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Accept-Ranges',
        'bytes',
      );

      // Verify stream was created and piped
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '/test/uploads/crypto-news/media/-1001234567890/12345_0.jpg',
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should return 404 for missing directory (Requirement 4.3)', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockRejectedValue(
        new Error('ENOENT: no such file or directory'),
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Media not found',
        }),
      );
    });

    it('should return 404 for missing file (Requirement 4.3)', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      // Directory exists but file doesn't match
      mockReaddir.mockResolvedValue(['99999_0.jpg'] as any);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Media not found',
          message: expect.stringContaining('Media file not found'),
        }),
      );
    });

    it('should detect MIME type for various file extensions', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      const testCases = [
        { ext: 'jpg', expectedMime: 'image/jpeg' },
        { ext: 'png', expectedMime: 'image/png' },
        { ext: 'webp', expectedMime: 'image/webp' },
        { ext: 'gif', expectedMime: 'image/gif' },
        { ext: 'mp4', expectedMime: 'video/mp4' },
        { ext: 'webm', expectedMime: 'video/webm' },
      ];

      for (const { ext, expectedMime } of testCases) {
        mockReaddir.mockResolvedValue([`12345_0.${ext}`] as any);
        mockStat.mockResolvedValue({
          size: 1024,
          mtime: new Date('2026-08-30T00:00:00Z'),
        } as any);

        const mockResponse = {
          setHeader: jest.fn(),
          headersSent: false,
        } as any;

        const mockStream = {
          pipe: jest.fn(),
          on: jest.fn().mockReturnThis(),
        };

        mockCreateReadStream.mockReturnValue(mockStream as any);

        // Act
        await controller.serveMedia(channelId, messageId, index, mockResponse);

        // Assert
        expect(mockResponse.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          expectedMime,
        );
      }
    });

    it('should use application/octet-stream for unknown MIME types', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.unknown'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/octet-stream',
      );
    });

    it('should set ETag based on mtime and size', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 4096,
        mtime: new Date('2026-08-30T12:34:56Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      const expectedETag = `"${new Date('2026-08-30T12:34:56Z').getTime()}-4096"`;
      expect(mockResponse.setHeader).toHaveBeenCalledWith('ETag', expectedETag);
    });

    it('should set Cache-Control to public with 1 year max-age (Requirement 4.5)', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=31536000',
      );
    });

    it('should stream file to response', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '/test/uploads/crypto-news/media/-1001234567890/12345_0.jpg',
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
      expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should return 400 for non-numeric messageId', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = 'not-a-number';
      const index = '0';

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid parameters',
          message: 'messageId and index must be numeric',
        }),
      );
    });

    it('should return 400 for non-numeric index', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = 'not-a-number';

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid parameters',
          message: 'messageId and index must be numeric',
        }),
      );
    });

    it('should handle file stat race condition (file disappears)', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockRejectedValue(
        new Error('ENOENT: no such file or directory'),
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Media not found',
          message: 'Media file missing on disk',
        }),
      );
    });

    it('should handle stream errors without crashing', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: true, // Headers already sent - should not try to send error response
      } as any;

      let errorHandler: ((err: Error) => void) | undefined;
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'error') {
            errorHandler = handler;
          }
          return mockStream;
        }),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Simulate stream error after headers sent
      if (errorHandler) {
        errorHandler(new Error('Stream read error'));
      }

      // Assert - Should log error but not crash
      expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));
      // Error handler should not send response if headers already sent
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should send 500 on stream error if headers not sent', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      let errorHandler: ((err: Error) => void) | undefined;
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'error') {
            errorHandler = handler;
          }
          return mockStream;
        }),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Simulate stream error before headers sent
      if (errorHandler) {
        errorHandler(new Error('Stream read error'));
      }

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error',
          message: 'Failed to stream media file',
        }),
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockRejectedValue(new Error('Unexpected filesystem error'));

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Media not found',
        }),
      );
    });

    it('should find files matching pattern {messageId}_{index}.*', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '2';

      mockReaddir.mockResolvedValue([
        '12345_0.jpg',
        '12345_1.png',
        '12345_2.webp', // This should match
        '12345_3.gif',
        '99999_2.jpg', // Wrong messageId
      ] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '/test/uploads/crypto-news/media/-1001234567890/12345_2.webp',
      );
    });

    it('should serve multiple media files from same message', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';

      const testCases = ['0', '1', '2'];

      for (const index of testCases) {
        mockReaddir.mockResolvedValue([`12345_${index}.jpg`] as any);
        mockStat.mockResolvedValue({
          size: 1024,
          mtime: new Date('2026-08-30T00:00:00Z'),
        } as any);

        const mockResponse = {
          setHeader: jest.fn(),
          headersSent: false,
        } as any;

        const mockStream = {
          pipe: jest.fn(),
          on: jest.fn().mockReturnThis(),
        };

        mockCreateReadStream.mockReturnValue(mockStream as any);

        // Act
        await controller.serveMedia(channelId, messageId, index, mockResponse);

        // Assert
        expect(mockCreateReadStream).toHaveBeenCalledWith(
          `/test/uploads/crypto-news/media/-1001234567890/12345_${index}.jpg`,
        );
      }
    });

    it('should support Accept-Ranges header for video seeking', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.mp4'] as any);
      mockStat.mockResolvedValue({
        size: 10485760, // 10MB
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Accept-Ranges',
        'bytes',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'video/mp4',
      );
    });

    it('should construct correct media directory path', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockReaddir).toHaveBeenCalledWith(
        '/test/uploads/crypto-news/media/-1001234567890',
      );
    });

    it('should initialize with uploads root from config', async () => {
      // Arrange
      const customUploadRoot = '/custom/uploads';
      const customConfigService = {
        get: jest.fn().mockReturnValue({
          uploads: {
            root: customUploadRoot,
          },
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [MediaController],
        providers: [
          {
            provide: ConfigService,
            useValue: customConfigService,
          },
        ],
      }).compile();

      const customController = module.get<MediaController>(MediaController);

      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await customController.serveMedia(
        channelId,
        messageId,
        index,
        mockResponse,
      );

      // Assert
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        `${customUploadRoot}/crypto-news/media/-1001234567890/12345_0.jpg`,
      );
    });

    it('should use default uploads root if config missing', async () => {
      // Arrange
      const emptyConfigService = {
        get: jest.fn().mockReturnValue(null),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [MediaController],
        providers: [
          {
            provide: ConfigService,
            useValue: emptyConfigService,
          },
        ],
      }).compile();

      const customController = module.get<MediaController>(MediaController);

      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await customController.serveMedia(
        channelId,
        messageId,
        index,
        mockResponse,
      );

      // Assert
      // Should use process.cwd() + 'uploads' as default
      expect(mockReaddir).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/crypto-news/media/-1001234567890'),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty directory', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue([]);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should handle very large file sizes', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.mp4'] as any);
      mockStat.mockResolvedValue({
        size: 1073741824, // 1GB
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        1073741824,
      );
    });

    it('should handle zero-size files', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 0,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Length', 0);
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle special characters in channel ID', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockReaddir).toHaveBeenCalledWith(
        '/test/uploads/crypto-news/media/-1001234567890',
      );
    });

    it('should handle negative messageId', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '-12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['-12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponse = {
        setHeader: jest.fn(),
        headersSent: false,
      } as any;

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await controller.serveMedia(channelId, messageId, index, mockResponse);

      // Assert
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '/test/uploads/crypto-news/media/-1001234567890/-12345_0.jpg',
      );
    });

    it('should handle concurrent requests for same file', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = '12345';
      const index = '0';

      mockReaddir.mockResolvedValue(['12345_0.jpg'] as any);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-08-30T00:00:00Z'),
      } as any);

      const mockResponses = Array.from({ length: 10 }, () => ({
        setHeader: jest.fn(),
        headersSent: false,
      })) as any[];

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };

      mockCreateReadStream.mockReturnValue(mockStream as any);

      // Act
      await Promise.all(
        mockResponses.map((mockResponse) =>
          controller.serveMedia(channelId, messageId, index, mockResponse),
        ),
      );

      // Assert
      mockResponses.forEach((mockResponse) => {
        expect(mockResponse.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'image/jpeg',
        );
        expect(mockResponse.setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'public, max-age=31536000',
        );
      });
    });
  });
});
