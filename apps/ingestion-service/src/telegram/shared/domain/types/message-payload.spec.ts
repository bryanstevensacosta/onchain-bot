/**
 * Unit tests for MessagePayload transformation
 * 
 * Tests the transformToPayload logic in IngestionCoordinator
 * to verify compliance with architectural invariants:
 * 
 * - Invariant 1: Text field EXCLUDED (ToS compliance - fix-1)
 * - Invariant 5: Media URLs follow path format /api/media/:channelId/:messageId/:index
 * - Requirements: Entities preservation, groupedId handling
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IngestionCoordinator } from 'telegram/shared/application/coordinators/ingestion.coordinator';
import { StreamService } from 'stream/application/services/stream.service';
import { DeduplicationService } from 'telegram/shared/application/services/deduplication.service';
import { LastSeenManager } from 'telegram/shared/infrastructure/services/last-seen-manager.service';
import type { MessagePayload } from './message-payload';

/**
 * TelegramRawMessage interface (matches backend TelegramListenerPort)
 */
interface TelegramRawMessage {
  peerId: string;
  messageId: number;
  text?: string;
  occurredAt: Date;
  media?: Array<{
    type: 'photo' | 'video';
    index: number;
    filePath: string;
    mimeType: string;
    fileSize: number;
  }>;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
  }>;
  groupedId?: string;
}

describe('MessagePayload Transformation', () => {
  let coordinator: IngestionCoordinator;
  let streamService: StreamService;
  let deduplicationService: DeduplicationService;
  let lastSeenManager: LastSeenManager;
  let broadcastedPayloads: MessagePayload[] = [];

  beforeEach(async () => {
    broadcastedPayloads = [];

    // Mock StreamService
    const mockStreamService = {
      broadcast: jest.fn((event: { type: string; data: MessagePayload }) => {
        broadcastedPayloads.push(event.data);
      }),
      getClientCount: jest.fn(() => 3),
    };

    // Mock DeduplicationService
    const mockDeduplicationService = {
      isDuplicate: jest.fn(() => false),
      getStats: jest.fn(() => ({ size: 0, hits: 0, misses: 0 })),
    };

    // Mock LastSeenManager
    const mockLastSeenManager = {
      get: jest.fn(() => null),
      set: jest.fn(),
    };

    // Mock ConfigService
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'app') {
          return {
            api: {
              baseUrl: 'http://localhost:3031',
            },
          };
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionCoordinator,
        { provide: StreamService, useValue: mockStreamService },
        { provide: DeduplicationService, useValue: mockDeduplicationService },
        { provide: LastSeenManager, useValue: mockLastSeenManager },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    coordinator = module.get<IngestionCoordinator>(IngestionCoordinator);
    streamService = module.get<StreamService>(StreamService);
    deduplicationService = module.get<DeduplicationService>(DeduplicationService);
    lastSeenManager = module.get<LastSeenManager>(LastSeenManager);
  });

  describe('Invariant 1: Text Exclusion (ToS Compliance)', () => {
    it('should exclude text field from payload even when present in raw message', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        text: 'SENSITIVE TEXT CONTENT - MUST NOT BE BROADCASTED',
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [],
        entities: [],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      expect(broadcastedPayloads).toHaveLength(1);
      const payload = broadcastedPayloads[0];

      // Critical: text field MUST NOT exist in the payload
      expect(payload).not.toHaveProperty('text');
      expect(payload).not.toHaveProperty('content');

      // Verify other fields are present
      expect(payload.peerId).toBe('-1001234567890');
      expect(payload.messageId).toBe(12345);
    });

    it('should handle messages without text field', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1009876543210',
        messageId: 54321,
        occurredAt: new Date('2026-08-30T13:00:00Z'),
        media: [],
        // No text field
      };

      // Act
      await coordinator.route(rawMessage, 'crypto-news');

      // Assert
      expect(broadcastedPayloads).toHaveLength(1);
      const payload = broadcastedPayloads[0];

      expect(payload).not.toHaveProperty('text');
      expect(payload.peerId).toBe('-1009876543210');
      expect(payload.messageId).toBe(54321);
    });

    it('should handle empty text field', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001111111111',
        messageId: 11111,
        text: '',
        occurredAt: new Date('2026-08-30T14:00:00Z'),
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      expect(broadcastedPayloads).toHaveLength(1);
      const payload = broadcastedPayloads[0];

      expect(payload).not.toHaveProperty('text');
    });
  });

  describe('Media URL Construction (GAP 4 - Invariant 5)', () => {
    it('should construct media URLs using correct format /api/media/:channelId/:messageId/:index', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/local/path/to/photo.jpg',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      expect(broadcastedPayloads).toHaveLength(1);
      const payload = broadcastedPayloads[0];

      expect(payload.media).toHaveLength(1);
      expect(payload.media[0].url).toBe('http://localhost:3031/api/media/-1001234567890/12345/0');
      expect(payload.media[0].type).toBe('photo');
      expect(payload.media[0].mimeType).toBe('image/jpeg');
      expect(payload.media[0].fileSize).toBe(245678);
    });

    it('should construct URLs for multiple media attachments with correct indices', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1009876543210',
        messageId: 99999,
        occurredAt: new Date('2026-08-30T15:00:00Z'),
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/local/path/photo1.jpg',
            mimeType: 'image/jpeg',
            fileSize: 100000,
          },
          {
            type: 'photo',
            index: 1,
            filePath: '/local/path/photo2.jpg',
            mimeType: 'image/jpeg',
            fileSize: 150000,
          },
          {
            type: 'video',
            index: 2,
            filePath: '/local/path/video.mp4',
            mimeType: 'video/mp4',
            fileSize: 5000000,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'crypto-news');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media).toHaveLength(3);
      expect(payload.media[0].url).toBe('http://localhost:3031/api/media/-1009876543210/99999/0');
      expect(payload.media[1].url).toBe('http://localhost:3031/api/media/-1009876543210/99999/1');
      expect(payload.media[2].url).toBe('http://localhost:3031/api/media/-1009876543210/99999/2');
    });

    it('should not include local filePath in payload (only HTTP URLs)', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/uploads/crypto-news/media/-1001234567890/12345-0.jpg',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media[0]).not.toHaveProperty('filePath');
      expect(payload.media[0].url).toMatch(/^http:\/\/localhost:3031\/api\/media\//);
    });

    it('should handle messages with no media', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media).toEqual([]);
    });

    it('should handle messages with undefined media field', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        // media: undefined
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media).toEqual([]);
    });

    it('should preserve media type (photo vs video)', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [
          {
            type: 'video',
            index: 0,
            filePath: '/local/video.mp4',
            mimeType: 'video/mp4',
            fileSize: 3000000,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media[0].type).toBe('video');
      expect(payload.media[0].mimeType).toBe('video/mp4');
    });
  });

  describe('Entities Preservation', () => {
    it('should preserve entities array with all fields', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        entities: [
          {
            type: 'url',
            offset: 10,
            length: 20,
            url: 'https://example.com',
          },
          {
            type: 'mention',
            offset: 35,
            length: 15,
          },
          {
            type: 'hashtag',
            offset: 55,
            length: 10,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.entities).toHaveLength(3);
      expect(payload.entities![0]).toEqual({
        type: 'url',
        offset: 10,
        length: 20,
        url: 'https://example.com',
      });
      expect(payload.entities![1]).toEqual({
        type: 'mention',
        offset: 35,
        length: 15,
      });
      expect(payload.entities![2]).toEqual({
        type: 'hashtag',
        offset: 55,
        length: 10,
      });
    });

    it('should handle empty entities array', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        entities: [],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.entities).toEqual([]);
    });

    it('should handle messages without entities field', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        // entities: undefined
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.entities).toBeUndefined();
    });

    it('should preserve entity URL field when present', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        entities: [
          {
            type: 'text_link',
            offset: 0,
            length: 10,
            url: 'https://dexscreener.com/solana/token123',
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.entities![0].url).toBe('https://dexscreener.com/solana/token123');
    });
  });

  describe('GroupedId Handling', () => {
    it('should preserve groupedId when present (media album)', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        groupedId: '123456789012345678',
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/local/photo1.jpg',
            mimeType: 'image/jpeg',
            fileSize: 100000,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.groupedId).toBe('123456789012345678');
    });

    it('should handle messages without groupedId', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        // groupedId: undefined
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.groupedId).toBeUndefined();
    });

    it('should handle empty groupedId string', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        groupedId: '',
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.groupedId).toBe('');
    });
  });

  describe('MessagePayload Structure', () => {
    it('should include all required fields with correct types', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload).toHaveProperty('peerId');
      expect(payload).toHaveProperty('messageId');
      expect(payload).toHaveProperty('occurredAt');
      expect(payload).toHaveProperty('media');
      expect(payload).toHaveProperty('messageType');

      expect(typeof payload.peerId).toBe('string');
      expect(typeof payload.messageId).toBe('number');
      expect(typeof payload.occurredAt).toBe('string');
      expect(Array.isArray(payload.media)).toBe(true);
      expect(typeof payload.messageType).toBe('string');
    });

    it('should convert occurredAt Date to ISO 8601 string', async () => {
      // Arrange
      const timestamp = new Date('2026-08-30T12:34:56.789Z');
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: timestamp,
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.occurredAt).toBe('2026-08-30T12:34:56.789Z');
      expect(payload.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should set messageType discriminator correctly for KOL messages', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.messageType).toBe('kol');
    });

    it('should set messageType discriminator correctly for crypto-news messages', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1009876543210',
        messageId: 54321,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
      };

      // Act
      await coordinator.route(rawMessage, 'crypto-news');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.messageType).toBe('crypto-news');
    });
  });

  describe('Complex Message Transformation', () => {
    it('should correctly transform complex message with all fields', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 99999,
        text: 'This text should NOT be in payload',
        occurredAt: new Date('2026-08-30T15:30:00Z'),
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/local/photo1.jpg',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
          {
            type: 'photo',
            index: 1,
            filePath: '/local/photo2.jpg',
            mimeType: 'image/jpeg',
            fileSize: 198765,
          },
        ],
        entities: [
          {
            type: 'url',
            offset: 10,
            length: 30,
            url: 'https://dexscreener.com/solana/token',
          },
          {
            type: 'hashtag',
            offset: 45,
            length: 8,
          },
        ],
        groupedId: '987654321098765432',
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      // Verify Invariant 1: no text
      expect(payload).not.toHaveProperty('text');

      // Verify structure
      expect(payload.peerId).toBe('-1001234567890');
      expect(payload.messageId).toBe(99999);
      expect(payload.occurredAt).toBe('2026-08-30T15:30:00.000Z');
      expect(payload.messageType).toBe('kol');

      // Verify media (Invariant 5)
      expect(payload.media).toHaveLength(2);
      expect(payload.media[0].url).toBe('http://localhost:3031/api/media/-1001234567890/99999/0');
      expect(payload.media[1].url).toBe('http://localhost:3031/api/media/-1001234567890/99999/1');

      // Verify entities
      expect(payload.entities).toHaveLength(2);
      expect(payload.entities![0].url).toBe('https://dexscreener.com/solana/token');

      // Verify groupedId
      expect(payload.groupedId).toBe('987654321098765432');
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative channel IDs in URLs', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/local/photo.jpg',
            mimeType: 'image/jpeg',
            fileSize: 100000,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media[0].url).toContain('/-1001234567890/');
    });

    it('should handle username-based channel IDs', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '@channelname',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: '/local/photo.jpg',
            mimeType: 'image/jpeg',
            fileSize: 100000,
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'crypto-news');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.peerId).toBe('@channelname');
      expect(payload.media[0].url).toContain('/@channelname/');
    });

    it('should handle large message IDs', async () => {
      // Arrange
      const largeMessageId = 999999999999;
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: largeMessageId,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.messageId).toBe(largeMessageId);
    });

    it('should handle large file sizes', async () => {
      // Arrange
      const rawMessage: TelegramRawMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date('2026-08-30T12:00:00Z'),
        media: [
          {
            type: 'video',
            index: 0,
            filePath: '/local/large-video.mp4',
            mimeType: 'video/mp4',
            fileSize: 2147483647, // Max 32-bit integer
          },
        ],
      };

      // Act
      await coordinator.route(rawMessage, 'kol');

      // Assert
      const payload = broadcastedPayloads[0];

      expect(payload.media[0].fileSize).toBe(2147483647);
    });
  });
});
