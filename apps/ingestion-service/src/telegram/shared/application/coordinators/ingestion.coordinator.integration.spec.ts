/**
 * Integration tests for broadcast pipeline deduplication
 *
 * Per Task 2.5: Integration tests for deduplication
 * Per Invariant 3: Deduplication at source before broadcast
 * Per Invariant 6: Cursor persistence survives service restarts
 *
 * Tests verify:
 * 1. Duplicate messageId - second message is skipped
 * 2. Cursor persistence - after restart, no re-broadcast
 * 3. Redis cursor tracking integration
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IngestionCoordinator } from './ingestion.coordinator';
import { StreamService } from 'stream/application/services/stream.service';
import { DeduplicationService } from '../services/deduplication.service';
import { LastSeenManager } from '../../infrastructure/services/last-seen-manager.service';
import { RedisService } from '../../../../shared/common/cache/redis.service';
import { DisconnectionTracker } from 'stream/application/services/disconnection-tracker.service';
import type { MessagePayload } from '../../domain/types/message-payload';

/**
 * TelegramRawMessage interface (from backend TelegramListenerPort)
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

describe('IngestionCoordinator - Broadcast Pipeline Deduplication (Integration)', () => {
  let coordinator: IngestionCoordinator;
  let streamService: StreamService;
  let deduplicationService: DeduplicationService;
  let lastSeenManager: LastSeenManager;
  let redisService: RedisService;
  let module: TestingModule;

  // Track broadcasted messages
  const broadcastedMessages: MessagePayload[] = [];

  // Mock Redis data store
  const mockRedisStore = new Map<string, string>();

  // Mock RedisService
  const mockRedisService = {
    isEnabled: jest.fn().mockReturnValue(true),
    get: jest.fn((key: string) =>
      Promise.resolve(mockRedisStore.get(key) || null),
    ),
    set: jest.fn((key: string, value: string) => {
      mockRedisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      mockRedisStore.delete(key);
      return Promise.resolve(1);
    }),
    getClient: jest.fn(),
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
      return undefined;
    }),
  };

  beforeEach(async () => {
    // Clear state
    broadcastedMessages.length = 0;
    mockRedisStore.clear();
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        IngestionCoordinator,
        StreamService,
        DeduplicationService,
        LastSeenManager,
        DisconnectionTracker,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    coordinator = module.get<IngestionCoordinator>(IngestionCoordinator);
    streamService = module.get<StreamService>(StreamService);
    deduplicationService =
      module.get<DeduplicationService>(DeduplicationService);
    lastSeenManager = module.get<LastSeenManager>(LastSeenManager);
    redisService = module.get<RedisService>(RedisService);

    // Spy on broadcast to capture messages
    jest.spyOn(streamService, 'broadcast').mockImplementation((event: any) => {
      if (event.type === 'message:telegram') {
        broadcastedMessages.push(event.data);
      }
    });
  });

  afterEach(async () => {
    await module.close();
  });

  /**
   * Helper to create a test message
   */
  function createMessage(
    channelId: string,
    messageId: number,
    overrides?: Partial<TelegramRawMessage>,
  ): TelegramRawMessage {
    return {
      peerId: channelId,
      messageId,
      text: `Test message ${messageId}`,
      occurredAt: new Date(),
      media: [],
      entities: [],
      ...overrides,
    };
  }

  describe('Duplicate messageId Detection (Invariant 3)', () => {
    it('should broadcast first message', async () => {
      const channelId = 'channel_001';
      const message = createMessage(channelId, 100);

      await coordinator.route(message, 'kol');

      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].peerId).toBe(channelId);
      expect(broadcastedMessages[0].messageId).toBe(100);
    });

    it('should skip duplicate messageId - second instance is not broadcasted', async () => {
      const channelId = 'channel_002';
      const message1 = createMessage(channelId, 200);
      const message2 = createMessage(channelId, 200); // Duplicate messageId

      // First message - should be broadcasted
      await coordinator.route(message1, 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Second message with same messageId - should be skipped
      await coordinator.route(message2, 'kol');
      expect(broadcastedMessages).toHaveLength(1); // Still only 1 message

      // Verify only first message was broadcasted
      expect(broadcastedMessages[0].messageId).toBe(200);
    });

    it('should skip messages with messageId <= last seen cursor', async () => {
      const channelId = 'channel_003';

      // Process messages 1-5
      for (let i = 1; i <= 5; i++) {
        const message = createMessage(channelId, i);
        await coordinator.route(message, 'kol');
      }

      expect(broadcastedMessages).toHaveLength(5);

      // Now try to re-broadcast old messages
      const oldMessage1 = createMessage(channelId, 3);
      const oldMessage2 = createMessage(channelId, 5);

      await coordinator.route(oldMessage1, 'kol');
      await coordinator.route(oldMessage2, 'kol');

      // Should still be 5 - old messages skipped
      expect(broadcastedMessages).toHaveLength(5);
    });

    it('should handle multiple channels independently', async () => {
      const channel1 = 'channel_multi_1';
      const channel2 = 'channel_multi_2';

      // Channel 1: messages 1-3
      for (let i = 1; i <= 3; i++) {
        await coordinator.route(createMessage(channel1, i), 'kol');
      }

      // Channel 2: messages 1-2
      for (let i = 1; i <= 2; i++) {
        await coordinator.route(createMessage(channel2, i), 'crypto-news');
      }

      expect(broadcastedMessages).toHaveLength(5);

      // Try duplicate in channel 1
      await coordinator.route(createMessage(channel1, 2), 'kol');
      expect(broadcastedMessages).toHaveLength(5); // Skipped

      // Try duplicate in channel 2
      await coordinator.route(createMessage(channel2, 1), 'crypto-news');
      expect(broadcastedMessages).toHaveLength(5); // Skipped

      // New message in channel 1 should work
      await coordinator.route(createMessage(channel1, 4), 'kol');
      expect(broadcastedMessages).toHaveLength(6);
    });

    it('should skip duplicates even with different text content', async () => {
      const channelId = 'channel_004';
      const message1 = createMessage(channelId, 300, {
        text: 'Original text',
      });
      const message2 = createMessage(channelId, 300, {
        text: 'Different text', // Different content, same messageId
      });

      await coordinator.route(message1, 'kol');
      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].messageId).toBe(300);

      // Duplicate messageId should be skipped regardless of content
      await coordinator.route(message2, 'kol');
      expect(broadcastedMessages).toHaveLength(1);
    });
  });

  describe('Redis Cursor Persistence (Invariant 6)', () => {
    it('should persist cursor to Redis after processing messages', async () => {
      const channelId = 'channel_persist_1';

      // Process messages 1-3
      for (let i = 1; i <= 3; i++) {
        const message = createMessage(channelId, i);
        await coordinator.route(message, 'kol');

        // Persist cursor after each message
        await lastSeenManager.persist(channelId, i);
      }

      // Verify Redis was called with correct keys
      const expectedKey = `ingestion:lastSeen:${channelId}`;
      expect(mockRedisService.set).toHaveBeenCalledWith(expectedKey, '1');
      expect(mockRedisService.set).toHaveBeenCalledWith(expectedKey, '2');
      expect(mockRedisService.set).toHaveBeenCalledWith(expectedKey, '3');

      // Verify final cursor in Redis
      expect(mockRedisStore.get(expectedKey)).toBe('3');
    });

    it('should load cursor from Redis on initialization', async () => {
      const channelId = 'channel_persist_2';

      // Simulate Redis having a persisted cursor
      const key = `ingestion:lastSeen:${channelId}`;
      mockRedisStore.set(key, '50');

      // Load cursor from Redis
      await lastSeenManager.load([channelId]);

      // Verify cursor was loaded
      const loaded = lastSeenManager.get(channelId);
      expect(loaded).toBe(50);

      // Old messages should be skipped
      await coordinator.route(createMessage(channelId, 45), 'kol');
      await coordinator.route(createMessage(channelId, 50), 'kol');
      expect(broadcastedMessages).toHaveLength(0);

      // New message should be broadcasted
      await coordinator.route(createMessage(channelId, 51), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].messageId).toBe(51);
    });

    it('should survive service restart - no re-broadcast of old messages', async () => {
      const channelId = 'channel_restart';

      // === Phase 1: Initial service run ===
      // Process messages 1-10
      for (let i = 1; i <= 10; i++) {
        const message = createMessage(channelId, i);
        await coordinator.route(message, 'kol');

        // Persist cursor to Redis
        lastSeenManager.set(channelId, i);
        await lastSeenManager.persist(channelId, i);
      }

      expect(broadcastedMessages).toHaveLength(10);
      expect(mockRedisStore.get(`ingestion:lastSeen:${channelId}`)).toBe('10');

      // Clear in-memory state (simulate restart)
      deduplicationService.clearAll();
      broadcastedMessages.length = 0;

      // === Phase 2: After service restart ===
      // Reload cursor from Redis
      await lastSeenManager.load([channelId]);
      const highestSeen = lastSeenManager.get(channelId);

      expect(highestSeen).toBe(10);

      // Try to re-broadcast old messages 1-10
      for (let i = 1; i <= 10; i++) {
        const message = createMessage(channelId, i);
        await coordinator.route(message, 'kol');
      }

      // Should be 0 - all old messages skipped due to cursor
      expect(broadcastedMessages).toHaveLength(0);

      // New message 11 should be broadcasted
      await coordinator.route(createMessage(channelId, 11), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].messageId).toBe(11);
    });

    it('should handle multiple channels after restart', async () => {
      const channel1 = 'channel_restart_multi_1';
      const channel2 = 'channel_restart_multi_2';

      // === Phase 1: Process messages for both channels ===
      for (let i = 1; i <= 5; i++) {
        await coordinator.route(createMessage(channel1, i), 'kol');
        lastSeenManager.set(channel1, i);
        await lastSeenManager.persist(channel1, i);
      }

      for (let i = 1; i <= 3; i++) {
        await coordinator.route(createMessage(channel2, i), 'crypto-news');
        lastSeenManager.set(channel2, i);
        await lastSeenManager.persist(channel2, i);
      }

      expect(broadcastedMessages).toHaveLength(8);

      // === Phase 2: Restart ===
      deduplicationService.clearAll();
      broadcastedMessages.length = 0;

      // Load cursors for both channels
      await lastSeenManager.load([channel1, channel2]);

      expect(lastSeenManager.get(channel1)).toBe(5);
      expect(lastSeenManager.get(channel2)).toBe(3);

      // === Phase 3: Verify old messages are skipped ===
      await coordinator.route(createMessage(channel1, 3), 'kol');
      await coordinator.route(createMessage(channel2, 2), 'crypto-news');
      expect(broadcastedMessages).toHaveLength(0);

      // New messages should work
      await coordinator.route(createMessage(channel1, 6), 'kol');
      await coordinator.route(createMessage(channel2, 4), 'crypto-news');
      expect(broadcastedMessages).toHaveLength(2);
    });

    it('should update cursor after each broadcast', async () => {
      const channelId = 'channel_cursor_update';

      // Process messages sequentially
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(lastSeenManager.get(channelId)).toBe(1);

      await coordinator.route(createMessage(channelId, 2), 'kol');
      expect(lastSeenManager.get(channelId)).toBe(2);

      await coordinator.route(createMessage(channelId, 5), 'kol');
      expect(lastSeenManager.get(channelId)).toBe(5);

      // Old message should be skipped due to cursor
      await coordinator.route(createMessage(channelId, 3), 'kol');
      expect(broadcastedMessages).toHaveLength(3); // Still 3, not 4
    });
  });

  describe('Redis Integration Edge Cases', () => {
    it('should handle Redis being disabled', async () => {
      // Mock Redis as disabled
      mockRedisService.isEnabled.mockReturnValue(false);

      const channelId = 'channel_no_redis';
      const message = createMessage(channelId, 100);

      // Should not throw
      await expect(coordinator.route(message, 'kol')).resolves.not.toThrow();

      // Message should still be broadcasted
      expect(broadcastedMessages).toHaveLength(1);

      // Persist should not throw
      await expect(
        lastSeenManager.persist(channelId, 100),
      ).resolves.not.toThrow();

      // Deduplication should still work with in-memory cache
      await coordinator.route(message, 'kol');
      expect(broadcastedMessages).toHaveLength(1); // Duplicate skipped
    });

    it('should handle Redis errors gracefully during persist', async () => {
      const channelId = 'channel_redis_error';
      const message = createMessage(channelId, 200);

      // Mock Redis set to throw error
      mockRedisService.set.mockRejectedValueOnce(
        new Error('Redis connection timeout'),
      );

      // Should not throw - logs warning instead
      await coordinator.route(message, 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Persist should not throw
      await expect(
        lastSeenManager.persist(channelId, 200),
      ).resolves.not.toThrow();
    });

    it('should handle Redis errors gracefully during load', async () => {
      const channelId = 'channel_load_error';

      // Mock Redis get to throw error
      mockRedisService.get.mockRejectedValueOnce(
        new Error('Redis unavailable'),
      );

      // Should not throw - logs warning and uses default
      await expect(lastSeenManager.load([channelId])).resolves.not.toThrow();

      // Should default to -1
      expect(lastSeenManager.get(channelId)).toBe(-1);

      // First message should be broadcasted
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
    });

    it('should ignore invalid cached values from Redis', async () => {
      const channelId = 'channel_invalid';

      // Store invalid value in Redis
      mockRedisStore.set('ingestion:lastSeen:channel_invalid', 'not-a-number');

      await lastSeenManager.load([channelId]);

      // Should default to -1 for invalid value
      expect(lastSeenManager.get(channelId)).toBe(-1);

      // First message should be broadcasted
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
    });

    it('should handle negative messageIds gracefully', async () => {
      const channelId = 'channel_negative';

      // First positive message to set cursor
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Negative messageId should be skipped (< cursor)
      await coordinator.route(createMessage(channelId, -1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Duplicate positive message should be skipped
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
    });
  });

  describe('Message Ordering and Out-of-Order Arrivals', () => {
    it('should handle out-of-order message arrivals', async () => {
      const channelId = 'channel_out_of_order';

      // Messages arrive out of order: 5, 3, 7
      // Message 5 arrives first
      await coordinator.route(createMessage(channelId, 5), 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Message 3 arrives (older message, should be skipped by cursor)
      await coordinator.route(createMessage(channelId, 3), 'kol');
      expect(broadcastedMessages).toHaveLength(1); // Skipped, 3 < 5

      // Message 7 arrives (newer message, should be broadcasted)
      await coordinator.route(createMessage(channelId, 7), 'kol');
      expect(broadcastedMessages).toHaveLength(2);

      // Second 7 should be skipped (caught by in-memory cache)
      await coordinator.route(createMessage(channelId, 7), 'kol');
      expect(broadcastedMessages).toHaveLength(2);
    });

    it('should handle message arrival after cursor update', async () => {
      const channelId = 'channel_late_arrival';

      // Process messages 1-10
      for (let i = 1; i <= 10; i++) {
        await coordinator.route(createMessage(channelId, i), 'kol');
        lastSeenManager.set(channelId, i);
      }

      // Late arrival of message 5
      await coordinator.route(createMessage(channelId, 5), 'kol');

      // Should be skipped (cursor is at 10)
      expect(broadcastedMessages).toHaveLength(10);
    });

    it('should handle gaps in message sequence', async () => {
      const channelId = 'channel_gaps';

      // Messages arrive with gaps: 1, 5, 10
      await coordinator.route(createMessage(channelId, 1), 'kol');
      await coordinator.route(createMessage(channelId, 5), 'kol');
      await coordinator.route(createMessage(channelId, 10), 'kol');

      expect(broadcastedMessages).toHaveLength(3);

      // Fill in gaps later - should be skipped
      await coordinator.route(createMessage(channelId, 3), 'kol');
      await coordinator.route(createMessage(channelId, 7), 'kol');

      expect(broadcastedMessages).toHaveLength(3);
    });
  });

  describe('Integration with StreamService', () => {
    it('should call StreamService.broadcast for non-duplicate messages', async () => {
      const channelId = 'channel_stream_integration';
      const message = createMessage(channelId, 999);

      await coordinator.route(message, 'kol');

      expect(streamService.broadcast).toHaveBeenCalledTimes(1);
      expect(streamService.broadcast).toHaveBeenCalledWith({
        type: 'message:telegram',
        data: expect.objectContaining({
          peerId: channelId,
          messageId: 999,
        }),
      });
    });

    it('should NOT call StreamService.broadcast for duplicate messages', async () => {
      const channelId = 'channel_stream_skip';
      const message = createMessage(channelId, 888);

      // First message
      await coordinator.route(message, 'kol');
      expect(streamService.broadcast).toHaveBeenCalledTimes(1);

      // Duplicate message
      await coordinator.route(message, 'kol');
      expect(streamService.broadcast).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should include correct messageType in payload', async () => {
      const channelId = 'channel_message_type';

      // KOL message
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(broadcastedMessages[0].messageType).toBe('kol');

      // Crypto-news message
      await coordinator.route(createMessage(channelId, 2), 'crypto-news');
      expect(broadcastedMessages[1].messageType).toBe('crypto-news');
    });
  });

  describe('Error Handling', () => {
    it('should not crash on broadcast errors', async () => {
      const channelId = 'channel_broadcast_error';
      const message = createMessage(channelId, 777);

      // Mock broadcast to throw error
      jest.spyOn(streamService, 'broadcast').mockImplementationOnce(() => {
        throw new Error('SSE client disconnected');
      });

      // Should not throw - error is logged
      await expect(coordinator.route(message, 'kol')).resolves.not.toThrow();
    });

    it('should continue processing after deduplication errors', async () => {
      const channelId = 'channel_dedup_error';

      // Mock isDuplicate to throw error once
      jest
        .spyOn(deduplicationService, 'isDuplicate')
        .mockImplementationOnce(() => {
          throw new Error('Dedup cache corrupted');
        });

      const message1 = createMessage(channelId, 111);
      const message2 = createMessage(channelId, 222);

      // First message throws error
      await expect(coordinator.route(message1, 'kol')).resolves.not.toThrow();

      // Second message should work normally
      await coordinator.route(message2, 'kol');
      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].messageId).toBe(222);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track deduplication stats', async () => {
      const channel1 = 'channel_stats_1';
      const channel2 = 'channel_stats_2';

      // Process messages
      for (let i = 1; i <= 5; i++) {
        await coordinator.route(createMessage(channel1, i), 'kol');
      }

      for (let i = 1; i <= 3; i++) {
        await coordinator.route(createMessage(channel2, i), 'crypto-news');
      }

      const stats = coordinator.getStats();

      expect(stats.deduplication.channels).toBe(2);
      expect(stats.deduplication.totalMessages).toBe(8);
      expect(stats.deduplication.cachesByChannel[channel1]).toBe(5);
      expect(stats.deduplication.cachesByChannel[channel2]).toBe(3);
    });
  });
});
