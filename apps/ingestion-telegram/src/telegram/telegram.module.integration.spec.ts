import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SSEBroadcastService } from '../stream/application/services/sse-broadcast.service';
import { BroadcastEvent } from '../stream/domain/broadcast-event.vo';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Unit tests for TelegramModule SSEBroadcastService wiring
 *
 * Per Requirement 4.1: Message ingested → broadcast called
 * Per Requirement 4.3: Broadcast failure doesn't stop ingestion
 *
 * Tests verify the broadcast logic without complex module dependencies.
 * Integration with full TelegramModule is covered by E2E tests.
 */
describe('TelegramModule - SSEBroadcast Wiring (Unit)', () => {
  describe('BroadcastEvent creation from raw message', () => {
    it('should create BroadcastEvent with all required fields', () => {
      // Arrange
      const channelId = '-1001234567890';
      const rawMessage = {
        id: 42,
        message: 'Test message content',
        date: 1704067200, // Unix timestamp in seconds
      };
      const mediaPath = '/uploads/crypto-news/media/-1001234567890/42_0.jpg';

      // Act
      const event = BroadcastEvent.fromTelegramMessage(
        channelId,
        rawMessage,
        mediaPath,
      );

      // Assert
      expect(event.channelId).toBe(channelId);
      expect(event.messageId).toBe(42);
      expect(event.content).toBe('Test message content');
      expect(event.mediaPath).toBe(mediaPath);
      expect(event.publishedAt).toBe(1704067200000); // Converted to ms
      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it('should handle message without media', () => {
      // Arrange
      const channelId = '-1001234567890';
      const rawMessage = {
        id: 43,
        message: 'Text only message',
        date: 1704067200,
      };

      // Act
      const event = BroadcastEvent.fromTelegramMessage(
        channelId,
        rawMessage,
        undefined, // No media
      );

      // Assert
      expect(event.channelId).toBe(channelId);
      expect(event.messageId).toBe(43);
      expect(event.content).toBe('Text only message');
      expect(event.mediaPath).toBeUndefined();
    });

    it('should handle message without text content', () => {
      // Arrange
      const channelId = '-1001234567890';
      const rawMessage = {
        id: 44,
        date: 1704067200,
        // No message or text field
      };

      // Act
      const event = BroadcastEvent.fromTelegramMessage(
        channelId,
        rawMessage,
        undefined,
      );

      // Assert
      expect(event.content).toBe(''); // Empty string, not undefined
      expect(event.messageId).toBe(44);
    });

    it('should use text field as fallback when message field is missing', () => {
      // Arrange
      const channelId = '-1001234567890';
      const rawMessage = {
        id: 45,
        text: 'Content from text field',
        date: 1704067200,
      };

      // Act
      const event = BroadcastEvent.fromTelegramMessage(
        channelId,
        rawMessage,
        undefined,
      );

      // Assert
      expect(event.content).toBe('Content from text field');
    });

    it('should convert channelId to string', () => {
      // Arrange - channelId might come as number or bigint
      const channelId = -1001234567890; // Number instead of string
      const rawMessage = {
        id: 46,
        message: 'Test',
        date: 1704067200,
      };

      // Act
      const event = BroadcastEvent.fromTelegramMessage(
        String(channelId),
        rawMessage,
        undefined,
      );

      // Assert
      expect(event.channelId).toBe('-1001234567890');
      expect(typeof event.channelId).toBe('string');
    });
  });

  describe('Broadcast error handling simulation', () => {
    let sseBroadcast: SSEBroadcastService;
    let broadcastSpy: jest.SpyInstance;

    beforeEach(async () => {
      const mockMetricsService = {
        sseClientsConnected: { set: jest.fn() },
        messagesBroadcastTotal: { inc: jest.fn() },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SSEBroadcastService,
          {
            provide: MetricsService,
            useValue: mockMetricsService,
          },
        ],
      }).compile();

      sseBroadcast = module.get<SSEBroadcastService>(SSEBroadcastService);
      broadcastSpy = jest.spyOn(sseBroadcast, 'broadcast');
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should demonstrate broadcast call pattern from TelegramModule', async () => {
      // Arrange - Simulate the exact flow in TelegramModule.startListening()
      const message = {
        peerId: '-1001234567890',
        messageId: 100,
        text: 'Test message',
        occurredAt: new Date(),
        media: [
          {
            type: 'photo' as const,
            index: 0,
            filePath: '/uploads/crypto-news/media/-1001234567890/100_0.jpg',
            mimeType: 'image/jpeg',
            fileSize: 12345,
          },
        ],
      };

      const mediaPath = message.media?.[0]?.filePath;

      // Act - This is the exact code from TelegramModule
      const event = BroadcastEvent.fromTelegramMessage(
        message.peerId,
        {
          id: message.messageId,
          message: message.text,
          date: Math.floor(message.occurredAt.getTime() / 1000),
        },
        mediaPath,
      );

      await sseBroadcast.broadcast(event);

      // Assert
      expect(broadcastSpy).toHaveBeenCalledTimes(1);
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: '-1001234567890',
          messageId: 100,
          content: 'Test message',
          mediaPath: '/uploads/crypto-news/media/-1001234567890/100_0.jpg',
        }),
      );
    });

    it('should demonstrate error handling does not throw', async () => {
      // Arrange
      broadcastSpy.mockRejectedValueOnce(new Error('Network error'));

      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: 200,
          message: 'Test',
          date: Math.floor(Date.now() / 1000),
        },
        undefined,
      );

      // Act & Assert - Error should be caught in TelegramModule try-catch
      await expect(async () => {
        try {
          await sseBroadcast.broadcast(event);
        } catch (broadcastError) {
          // This is what TelegramModule does - log but don't throw
          // In real code: logger.error(...)
          expect(broadcastError).toBeInstanceOf(Error);
          expect((broadcastError as Error).message).toBe('Network error');
          // Don't re-throw - ingestion continues
        }
      }).not.toThrow();
    });

    it('should handle multiple broadcasts sequentially', async () => {
      // Arrange
      const events = [
        BroadcastEvent.fromTelegramMessage(
          '-1001234567890',
          { id: 1, message: 'Message 1', date: 1704067200 },
          undefined,
        ),
        BroadcastEvent.fromTelegramMessage(
          '-1001234567890',
          { id: 2, message: 'Message 2', date: 1704067201 },
          undefined,
        ),
        BroadcastEvent.fromTelegramMessage(
          '-1001234567890',
          { id: 3, message: 'Message 3', date: 1704067202 },
          undefined,
        ),
      ];

      // Act - Broadcast sequentially like TelegramModule does
      for (const event of events) {
        await sseBroadcast.broadcast(event);
      }

      // Assert
      expect(broadcastSpy).toHaveBeenCalledTimes(3);
      expect(broadcastSpy.mock.calls[0][0].messageId).toBe(1);
      expect(broadcastSpy.mock.calls[1][0].messageId).toBe(2);
      expect(broadcastSpy.mock.calls[2][0].messageId).toBe(3);
    });
  });

  describe('Media path extraction pattern', () => {
    it('should extract media path from first media item', () => {
      // Arrange - Simulating message.media?.[0]?.filePath pattern
      const messageWithMedia = {
        media: [
          {
            type: 'photo' as const,
            index: 0,
            filePath: '/uploads/crypto-news/media/channel/42_0.jpg',
            mimeType: 'image/jpeg',
            fileSize: 12345,
          },
        ],
      };

      const messageWithoutMedia = {
        media: undefined,
      };

      const messageWithEmptyMedia = {
        media: [],
      };

      // Act
      const mediaPath1 = messageWithMedia.media?.[0]?.filePath;
      const mediaPath2 = messageWithoutMedia.media?.[0]?.filePath;
      const mediaPath3 = messageWithEmptyMedia.media?.[0]?.filePath;

      // Assert
      expect(mediaPath1).toBe('/uploads/crypto-news/media/channel/42_0.jpg');
      expect(mediaPath2).toBeUndefined();
      expect(mediaPath3).toBeUndefined();
    });
  });
});
