import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { StreamService } from '../../application/services/stream.service';
import type { Request, Response } from 'express';

/**
 * Mock TelegramListenerPort for testing backfill endpoint
 */
interface MockTelegramListenerPort {
  backfill: jest.Mock;
}

/**
 * Mock message structure matching TelegramRawMessage interface
 */
interface MockMessage {
  peerId: string;
  messageId: number;
  occurredAt: string;
  text: string;
  media: Array<{
    type: string;
    index: number;
    url: string;
    mimeType: string;
    fileSize: number;
  }>;
  entities: any[];
  groupedId?: string;
}

/**
 * Integration tests for StreamController backfill endpoint
 * 
 * **Validates: Requirements GAP 1**
 * 
 * Tests backfill endpoint behavior:
 * - SSE stream format compliance
 * - backfill:message events for each message
 * - backfill:complete event with total count
 * - Unknown channel handling (empty stream)
 * - Limit parameter validation
 * - Error handling
 */
describe('StreamController - Backfill Endpoint', () => {
  let controller: StreamController;
  let streamService: StreamService;
  let mockTelegramListener: MockTelegramListenerPort;

  /**
   * Helper to create mock Express Request
   */
  const createMockRequest = (): Partial<Request> => ({
    ip: '127.0.0.1',
    on: jest.fn(),
  });

  /**
   * Helper to create mock Express Response with SSE support
   */
  const createMockResponse = () => {
    const chunks: string[] = [];
    
    return {
      writeHead: jest.fn(),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      writableEnded: false,
      chunks, // For test assertions
    } as any as Response;
  };

  /**
   * Helper to create test messages
   */
  const createTestMessage = (
    channelId: string,
    messageId: number,
  ): MockMessage => ({
    peerId: channelId,
    messageId,
    occurredAt: new Date().toISOString(),
    text: `Test message ${messageId}`,
    media: [],
    entities: [],
  });

  /**
   * Helper to parse SSE chunks into events
   */
  const parseSSEChunks = (chunks: string[]): Array<{ event: string; data: any }> => {
    const events: Array<{ event: string; data: any }> = [];
    
    for (const chunk of chunks) {
      const eventMatch = chunk.match(/^event: (.+)$/m);
      const dataMatch = chunk.match(/^data: (.+)$/m);
      
      if (eventMatch && dataMatch) {
        events.push({
          event: eventMatch[1],
          data: JSON.parse(dataMatch[1]),
        });
      }
    }
    
    return events;
  };

  beforeEach(async () => {
    // Create mock TelegramListener
    mockTelegramListener = {
      backfill: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamController],
      providers: [
        {
          provide: StreamService,
          useValue: {
            addClient: jest.fn(),
            removeClient: jest.fn(),
            getClientCount: jest.fn().mockReturnValue(0),
            getConnectedClients: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: 'TelegramListenerPort',
          useValue: mockTelegramListener,
        },
      ],
    }).compile();

    controller = module.get<StreamController>(StreamController);
    streamService = module.get<StreamService>(StreamService);
  });

  describe('backfill - SSE Stream Format (Requirement GAP 1)', () => {
    it('should set correct SSE headers', async () => {
      // Arrange
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();
      
      mockTelegramListener.backfill.mockResolvedValue([]);

      // Act
      await controller.backfill('-1001234567890', undefined, mockRequest, mockResponse);

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    });

    it('should stream messages as backfill:message events', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessages = [
        createTestMessage(channelId, 100),
        createTestMessage(channelId, 101),
        createTestMessage(channelId, 102),
      ];
      
      mockTelegramListener.backfill.mockResolvedValue(testMessages);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, '3', mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      
      // Should have 3 message events + 1 complete event
      expect(events.length).toBe(4);
      
      // First 3 should be backfill:message events
      expect(events[0].event).toBe('backfill:message');
      expect(events[1].event).toBe('backfill:message');
      expect(events[2].event).toBe('backfill:message');
      
      // Verify message data structure
      expect(events[0].data).toMatchObject({
        peerId: channelId,
        messageId: 100,
        occurredAt: expect.any(String),
        text: expect.any(String),
      });
    });

    it('should send backfill:complete event with total count', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessages = [
        createTestMessage(channelId, 100),
        createTestMessage(channelId, 101),
      ];
      
      mockTelegramListener.backfill.mockResolvedValue(testMessages);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, '2', mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      
      // Last event should be backfill:complete
      const completeEvent = events[events.length - 1];
      expect(completeEvent.event).toBe('backfill:complete');
      expect(completeEvent.data).toMatchObject({
        channelId,
        count: 2,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should end the response stream after completion', async () => {
      // Arrange
      mockTelegramListener.backfill.mockResolvedValue([]);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill('-1001234567890', undefined, mockRequest, mockResponse);

      // Assert
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe('backfill - Unknown Channel (Requirement GAP 1)', () => {
    it('should return empty stream for unknown channel', async () => {
      // Arrange
      const unknownChannelId = '-1009999999999';
      mockTelegramListener.backfill.mockResolvedValue([]);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(unknownChannelId, undefined, mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      
      // Should only have backfill:complete event with count 0
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('backfill:complete');
      expect(events[0].data.count).toBe(0);
      expect(events[0].data.channelId).toBe(unknownChannelId);
    });

    it('should handle empty result from TelegramListener', async () => {
      // Arrange
      mockTelegramListener.backfill.mockResolvedValue([]);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill('-1001234567890', '10', mockRequest, mockResponse);

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalled();
      expect(mockResponse.end).toHaveBeenCalled();
      
      const events = parseSSEChunks(mockResponse.chunks);
      expect(events[0].event).toBe('backfill:complete');
      expect(events[0].data.count).toBe(0);
    });
  });

  describe('backfill - Limit Parameter (Requirement GAP 1)', () => {
    it('should honor limit parameter', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const limit = 5;
      const testMessages = Array.from({ length: limit }, (_, i) =>
        createTestMessage(channelId, 100 + i),
      );
      
      mockTelegramListener.backfill.mockResolvedValue(testMessages);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, String(limit), mockRequest, mockResponse);

      // Assert
      expect(mockTelegramListener.backfill).toHaveBeenCalledWith(channelId, limit);
      
      const events = parseSSEChunks(mockResponse.chunks);
      // Should have 5 message events + 1 complete event
      expect(events.filter((e) => e.event === 'backfill:message').length).toBe(5);
    });

    it('should use default limit of 100 when not specified', async () => {
      // Arrange
      mockTelegramListener.backfill.mockResolvedValue([]);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill('-1001234567890', undefined, mockRequest, mockResponse);

      // Assert
      expect(mockTelegramListener.backfill).toHaveBeenCalledWith('-1001234567890', 100);
    });

    it('should reject limit below minimum (1)', async () => {
      // Arrange
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act & Assert
      await expect(
        controller.backfill('-1001234567890', '0', mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
      
      await expect(
        controller.backfill('-1001234567890', '-5', mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject limit above maximum (100)', async () => {
      // Arrange
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act & Assert
      await expect(
        controller.backfill('-1001234567890', '101', mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
      
      await expect(
        controller.backfill('-1001234567890', '500', mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-numeric limit', async () => {
      // Arrange
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act & Assert
      await expect(
        controller.backfill('-1001234567890', 'invalid', mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
      
      await expect(
        controller.backfill('-1001234567890', 'abc', mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept limit at boundary values', async () => {
      // Arrange
      mockTelegramListener.backfill.mockResolvedValue([]);
      const mockRequest = createMockRequest() as Request;

      // Act & Assert - Min boundary (1)
      const mockResponse1 = createMockResponse();
      await controller.backfill('-1001234567890', '1', mockRequest, mockResponse1);
      expect(mockTelegramListener.backfill).toHaveBeenCalledWith('-1001234567890', 1);

      // Act & Assert - Max boundary (100)
      const mockResponse2 = createMockResponse();
      await controller.backfill('-1001234567890', '100', mockRequest, mockResponse2);
      expect(mockTelegramListener.backfill).toHaveBeenCalledWith('-1001234567890', 100);
    });
  });

  describe('backfill - Error Handling', () => {
    it('should return 503 when TelegramListener is not available', async () => {
      // Arrange
      const moduleWithoutListener: TestingModule = await Test.createTestingModule({
        controllers: [StreamController],
        providers: [
          {
            provide: StreamService,
            useValue: streamService,
          },
          // No TelegramListenerPort provider
        ],
      }).compile();

      const controllerWithoutListener = moduleWithoutListener.get<StreamController>(StreamController);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controllerWithoutListener.backfill('-1001234567890', undefined, mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service unavailable',
        message: 'Telegram MTProto layer not yet initialized',
      });
    });

    it('should send backfill:error event when TelegramListener throws', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const errorMessage = 'MTProto connection lost';
      mockTelegramListener.backfill.mockRejectedValue(new Error(errorMessage));
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, undefined, mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      
      // Should have error event
      expect(events.length).toBeGreaterThanOrEqual(1);
      const errorEvent = events.find((e) => e.event === 'backfill:error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data).toMatchObject({
        error: errorMessage,
        channelId,
      });
      
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should handle TelegramListener timeout gracefully', async () => {
      // Arrange
      mockTelegramListener.backfill.mockImplementation(
        () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 100);
        }),
      );
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill('-1001234567890', undefined, mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      const errorEvent = events.find((e) => e.event === 'backfill:error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data.error).toBe('Request timeout');
    });
  });

  describe('backfill - Message Structure Validation', () => {
    it('should stream messages with complete metadata', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessage: MockMessage = {
        peerId: channelId,
        messageId: 12345,
        occurredAt: '2026-08-30T12:00:00Z',
        text: 'Alpha call: BUY $TOKEN',
        media: [
          {
            type: 'photo',
            index: 0,
            url: '/api/media/-1001234567890/12345/0',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
        ],
        entities: [
          {
            type: 'url',
            offset: 10,
            length: 20,
            url: 'https://example.com',
          },
        ],
        groupedId: '987654321',
      };
      
      mockTelegramListener.backfill.mockResolvedValue([testMessage]);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, '1', mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      const messageEvent = events.find((e) => e.event === 'backfill:message');
      
      expect(messageEvent).toBeDefined();
      expect(messageEvent!.data).toMatchObject({
        peerId: channelId,
        messageId: 12345,
        occurredAt: '2026-08-30T12:00:00Z',
        text: 'Alpha call: BUY $TOKEN',
        media: [
          {
            type: 'photo',
            index: 0,
            url: '/api/media/-1001234567890/12345/0',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
        ],
        entities: [
          {
            type: 'url',
            offset: 10,
            length: 20,
            url: 'https://example.com',
          },
        ],
        groupedId: '987654321',
      });
    });

    it('should handle messages without media', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessage: MockMessage = {
        peerId: channelId,
        messageId: 100,
        occurredAt: new Date().toISOString(),
        text: 'Text only message',
        media: [],
        entities: [],
      };
      
      mockTelegramListener.backfill.mockResolvedValue([testMessage]);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, '1', mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      const messageEvent = events.find((e) => e.event === 'backfill:message');
      
      expect(messageEvent!.data.media).toEqual([]);
      expect(messageEvent!.data.text).toBe('Text only message');
    });

    it('should preserve message order', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessages = [
        createTestMessage(channelId, 100),
        createTestMessage(channelId, 101),
        createTestMessage(channelId, 102),
        createTestMessage(channelId, 103),
        createTestMessage(channelId, 104),
      ];
      
      mockTelegramListener.backfill.mockResolvedValue(testMessages);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, '5', mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      const messageEvents = events.filter((e) => e.event === 'backfill:message');
      
      expect(messageEvents.length).toBe(5);
      expect(messageEvents[0].data.messageId).toBe(100);
      expect(messageEvents[1].data.messageId).toBe(101);
      expect(messageEvents[2].data.messageId).toBe(102);
      expect(messageEvents[3].data.messageId).toBe(103);
      expect(messageEvents[4].data.messageId).toBe(104);
    });
  });

  describe('backfill - Performance', () => {
    it('should handle maximum limit (100 messages) efficiently', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessages = Array.from({ length: 100 }, (_, i) =>
        createTestMessage(channelId, 1000 + i),
      );
      
      mockTelegramListener.backfill.mockResolvedValue(testMessages);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      const startTime = Date.now();
      await controller.backfill(channelId, '100', mockRequest, mockResponse);
      const duration = Date.now() - startTime;

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      const messageEvents = events.filter((e) => e.event === 'backfill:message');
      
      expect(messageEvents.length).toBe(100);
      expect(duration).toBeLessThan(1000); // Should complete in < 1s
    });
  });

  describe('backfill - Integration Scenarios', () => {
    it('should handle multiple concurrent backfill requests', async () => {
      // Arrange
      const channelId1 = '-1001111111111';
      const channelId2 = '-1002222222222';
      
      mockTelegramListener.backfill
        .mockResolvedValueOnce([createTestMessage(channelId1, 100)])
        .mockResolvedValueOnce([createTestMessage(channelId2, 200)]);
      
      const mockRequest1 = createMockRequest() as Request;
      const mockResponse1 = createMockResponse();
      
      const mockRequest2 = createMockRequest() as Request;
      const mockResponse2 = createMockResponse();

      // Act - Fire concurrent requests
      await Promise.all([
        controller.backfill(channelId1, '1', mockRequest1, mockResponse1),
        controller.backfill(channelId2, '1', mockRequest2, mockResponse2),
      ]);

      // Assert
      const events1 = parseSSEChunks(mockResponse1.chunks);
      const events2 = parseSSEChunks(mockResponse2.chunks);
      
      const message1 = events1.find((e) => e.event === 'backfill:message');
      const message2 = events2.find((e) => e.event === 'backfill:message');
      
      expect(message1!.data.peerId).toBe(channelId1);
      expect(message2!.data.peerId).toBe(channelId2);
    });

    it('should complete backfill even with mixed message types', async () => {
      // Arrange
      const channelId = '-1001234567890';
      const testMessages: MockMessage[] = [
        {
          ...createTestMessage(channelId, 100),
          media: [
            {
              type: 'photo',
              index: 0,
              url: '/api/media/-1001234567890/100/0',
              mimeType: 'image/jpeg',
              fileSize: 100000,
            },
          ],
        },
        createTestMessage(channelId, 101), // Text only
        {
          ...createTestMessage(channelId, 102),
          media: [
            {
              type: 'video',
              index: 0,
              url: '/api/media/-1001234567890/102/0',
              mimeType: 'video/mp4',
              fileSize: 500000,
            },
          ],
          groupedId: '123456',
        },
      ];
      
      mockTelegramListener.backfill.mockResolvedValue(testMessages);
      
      const mockRequest = createMockRequest() as Request;
      const mockResponse = createMockResponse();

      // Act
      await controller.backfill(channelId, '3', mockRequest, mockResponse);

      // Assert
      const events = parseSSEChunks(mockResponse.chunks);
      const messageEvents = events.filter((e) => e.event === 'backfill:message');
      
      expect(messageEvents.length).toBe(3);
      expect(messageEvents[0].data.media.length).toBe(1);
      expect(messageEvents[1].data.media.length).toBe(0);
      expect(messageEvents[2].data.media.length).toBe(1);
      expect(messageEvents[2].data.groupedId).toBe('123456');
      
      const completeEvent = events.find((e) => e.event === 'backfill:complete');
      expect(completeEvent!.data.count).toBe(3);
    });
  });
});
