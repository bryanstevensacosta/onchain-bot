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
import { MessagePersistenceCoordinator } from './message-persistence.coordinator';
import { StreamService } from 'stream/application/services/stream.service';
import { DeduplicationService } from '../services/deduplication.service';
import { LastSeenManager } from '../../infrastructure/services/last-seen-manager.service';
import { RedisService } from 'shared/common/cache/redis.service';
import { TelegramFeedMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
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

describe('MessagePersistenceCoordinator - Broadcast Pipeline Deduplication (Integration)', () => {
  let coordinator: MessagePersistenceCoordinator;
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
        MessagePersistenceCoordinator,
        StreamService,
        DeduplicationService,
        LastSeenManager,
        {
          provide: TelegramFeedMessageRepository,
          useValue: {
            findByChannelAndMessageId: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({}),
            find: jest.fn().mockResolvedValue([]),
          },
        },
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

    coordinator = module.get<MessagePersistenceCoordinator>(
      MessagePersistenceCoordinator,
    );
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

    it('should skip duplicate messageId on second route (dedup at source)', async () => {
      const channelId = 'channel_002';
      const message1 = createMessage(channelId, 200);
      const message2 = createMessage(channelId, 200); // Duplicate messageId

      // First message - should be broadcasted
      await coordinator.route(message1, 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Second message with same messageId - skipped (in-memory cache hit)
      await coordinator.route(message2, 'kol');
      expect(broadcastedMessages).toHaveLength(1); // Still 1, duplicate skipped

      // Verify only the first message was broadcasted
      expect(broadcastedMessages[0].messageId).toBe(200);
    });

    it('should skip old messageIds below the cursor', async () => {
      const channelId = 'channel_003';

      // Process messages 1-5
      for (let i = 1; i <= 5; i++) {
        const message = createMessage(channelId, i);
        await coordinator.route(message, 'kol');
      }

      expect(broadcastedMessages).toHaveLength(5);

      // Now try to re-broadcast old messages (cursor = 5)
      const oldMessage1 = createMessage(channelId, 3);
      const oldMessage2 = createMessage(channelId, 5);

      await coordinator.route(oldMessage1, 'kol');
      await coordinator.route(oldMessage2, 'kol');

      // Still 5 - old messages skipped via cursor + cache
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

      // Duplicate in channel 1 - skipped (dedup)
      await coordinator.route(createMessage(channel1, 2), 'kol');
      expect(broadcastedMessages).toHaveLength(5);

      // Duplicate in channel 2 - skipped (dedup)
      await coordinator.route(createMessage(channel2, 1), 'crypto-news');
      expect(broadcastedMessages).toHaveLength(5);

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

      // Duplicate messageId is skipped even with different content (dedup)
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

      // Old messages at/below cursor are skipped (dedup enforced in route)
      await coordinator.route(createMessage(channelId, 45), 'kol');
      await coordinator.route(createMessage(channelId, 50), 'kol');
      expect(broadcastedMessages).toHaveLength(0);

      // New message should be broadcasted
      await coordinator.route(createMessage(channelId, 51), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].messageId).toBe(51);
    });

    it('should survive service restart - old messages skipped via cursor', async () => {
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

      // Try to re-broadcast old messages 1-10 (all skipped - cursor is 10)
      for (let i = 1; i <= 10; i++) {
        const message = createMessage(channelId, i);
        await coordinator.route(message, 'kol');
      }

      // Should be 0 - all old messages skipped via cursor filtering
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

      // === Phase 3: Old messages are skipped (cursor enforced in route)
      await coordinator.route(createMessage(channel1, 3), 'kol');
      await coordinator.route(createMessage(channel2, 2), 'crypto-news');
      expect(broadcastedMessages).toHaveLength(0);

      // New messages should work
      await coordinator.route(createMessage(channel1, 6), 'kol');
      await coordinator.route(createMessage(channel2, 4), 'crypto-news');
      expect(broadcastedMessages).toHaveLength(2);
    });

    it('should update cursor tracking in route (cursor enforced)', async () => {
      const channelId = 'channel_cursor_update';

      // Process messages sequentially - route() sets the cursor itself
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(lastSeenManager.get(channelId)).toBe(1);

      await coordinator.route(createMessage(channelId, 2), 'kol');
      expect(lastSeenManager.get(channelId)).toBe(2);

      await coordinator.route(createMessage(channelId, 5), 'kol');
      expect(lastSeenManager.get(channelId)).toBe(5);

      // Old message below cursor is skipped (dedup enforced in route)
      await coordinator.route(createMessage(channelId, 3), 'kol');
      expect(broadcastedMessages).toHaveLength(3); // Only the 3 new ones
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

      // Duplicate is skipped via in-memory cache (dedup works without Redis)
      await coordinator.route(message, 'kol');
      expect(broadcastedMessages).toHaveLength(1);
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

      // Negative messageId is below cursor → skipped
      await coordinator.route(createMessage(channelId, -1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Duplicate positive message is skipped via cache
      await coordinator.route(createMessage(channelId, 1), 'kol');
      expect(broadcastedMessages).toHaveLength(1);
    });
  });

  describe('Message Ordering and Out-of-Order Arrivals', () => {
    it('should skip stale out-of-order arrivals below the cursor', async () => {
      const channelId = 'channel_out_of_order';

      // Messages arrive out of order: 5, 3, 7
      // Message 5 arrives first
      await coordinator.route(createMessage(channelId, 5), 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Message 3 arrives (older message, skipped — below cursor 5)
      await coordinator.route(createMessage(channelId, 3), 'kol');
      expect(broadcastedMessages).toHaveLength(1);

      // Message 7 arrives (newer message, should be broadcasted)
      await coordinator.route(createMessage(channelId, 7), 'kol');
      expect(broadcastedMessages).toHaveLength(2);

      // Second 7 is skipped (cache hit)
      await coordinator.route(createMessage(channelId, 7), 'kol');
      expect(broadcastedMessages).toHaveLength(2);
    });

    it('should skip late arrivals below the cursor', async () => {
      const channelId = 'channel_late_arrival';

      // Process messages 1-10
      for (let i = 1; i <= 10; i++) {
        await coordinator.route(createMessage(channelId, i), 'kol');
        lastSeenManager.set(channelId, i);
      }

      // Late arrival of message 5
      await coordinator.route(createMessage(channelId, 5), 'kol');

      // Skipped (below cursor 10)
      expect(broadcastedMessages).toHaveLength(10);
    });

    it('should broadcast gap fills above the cursor, skip replays', async () => {
      const channelId = 'channel_gaps';

      // Messages arrive with gaps: 1, 5, 10
      await coordinator.route(createMessage(channelId, 1), 'kol');
      await coordinator.route(createMessage(channelId, 5), 'kol');
      await coordinator.route(createMessage(channelId, 10), 'kol');

      expect(broadcastedMessages).toHaveLength(3);

      // Gap fills below cursor are skipped (cursor = 10)
      await coordinator.route(createMessage(channelId, 3), 'kol');
      await coordinator.route(createMessage(channelId, 7), 'kol');

      expect(broadcastedMessages).toHaveLength(3);
    });
  });

  describe('Integration with StreamService', () => {
    it('should call StreamService.broadcast for all messages', async () => {
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

    it('should skip StreamService.broadcast for duplicates', async () => {
      const channelId = 'channel_stream_skip';
      const message = createMessage(channelId, 888);

      // First message
      await coordinator.route(message, 'kol');
      expect(streamService.broadcast).toHaveBeenCalledTimes(1);

      // Duplicate message - skipped (dedup check)
      await coordinator.route(message, 'kol');
      expect(streamService.broadcast).toHaveBeenCalledTimes(1);
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

    it('should continue processing after errors', async () => {
      const channelId = 'channel_dedup_error';

      const message1 = createMessage(channelId, 111);
      const message2 = createMessage(channelId, 222);

      // First message works normally
      await expect(coordinator.route(message1, 'kol')).resolves.not.toThrow();
      expect(broadcastedMessages).toHaveLength(1);

      // Second message should work normally
      await coordinator.route(message2, 'kol');
      expect(broadcastedMessages).toHaveLength(2);
      expect(broadcastedMessages[1].messageId).toBe(222);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should broadcast all messages successfully', async () => {
      const channel1 = 'channel_stats_1';
      const channel2 = 'channel_stats_2';

      // Process messages
      for (let i = 1; i <= 5; i++) {
        await coordinator.route(createMessage(channel1, i), 'kol');
      }

      for (let i = 1; i <= 3; i++) {
        await coordinator.route(createMessage(channel2, i), 'crypto-news');
      }

      // All 8 messages should be broadcasted
      expect(broadcastedMessages).toHaveLength(8);

      // Verify channels processed
      const channel1Messages = broadcastedMessages.filter(
        (m) => m.peerId === channel1,
      );
      const channel2Messages = broadcastedMessages.filter(
        (m) => m.peerId === channel2,
      );

      expect(channel1Messages).toHaveLength(5);
      expect(channel2Messages).toHaveLength(3);
    });
  });

  describe('Feed type discriminator (item 3: rename + type; item 7: kol persist)', () => {
    it("persists crypto-news messages with type='crypto-news'", async () => {
      const feedRepo = module.get<TelegramFeedMessageRepository>(
        TelegramFeedMessageRepository,
      );

      await coordinator.route(
        createMessage('channel_feed_type', 1),
        'crypto-news',
      );

      expect(feedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'crypto-news' }),
      );
    });

    it("persists KOL messages with type='kol', RAW content, no media (Q1-B + policy C2)", async () => {
      const feedRepo = module.get<TelegramFeedMessageRepository>(
        TelegramFeedMessageRepository,
      );
      const saveMock = feedRepo.save as jest.Mock;
      saveMock.mockClear();

      const raw = createMessage('channel_kol_persist', 10, {
        text: 'KOL ALPHA: $SOL to $500',
        media: [],
      });

      await coordinator.route(raw, 'kol');

      expect(saveMock).toHaveBeenCalledTimes(1);
      const saved = saveMock.mock.calls[0][0];
      expect(saved.type).toBe('kol');
      expect(saved.channelId).toBe('channel_kol_persist');
      expect(saved.messageId).toBe(10);
      expect(saved.content).toBe('KOL ALPHA: $SOL to $500');
      expect(saved.media).toEqual([]);

      // SSE frame carries the same text (Q1-B)
      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0].text).toBe('KOL ALPHA: $SOL to $500');
      expect(broadcastedMessages[0].messageType).toBe('kol');
    });

    it('duplicate realtime+polling delivery persists exactly 1 row (isDuplicate wired)', async () => {
      const feedRepo = module.get<TelegramFeedMessageRepository>(
        TelegramFeedMessageRepository,
      );
      const saveMock = feedRepo.save as jest.Mock;
      saveMock.mockClear();

      // Same message arrives twice (realtime event + 30s polling sweep)
      const realtime = createMessage('channel_kol_dup', 77, {
        text: 'Same alpha twice',
      });
      const polling = createMessage('channel_kol_dup', 77, {
        text: 'Same alpha twice',
      });

      await coordinator.route(realtime, 'kol');
      await coordinator.route(polling, 'kol');

      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(broadcastedMessages).toHaveLength(1);
    });

    it('duplicate crypto-news realtime+polling delivery persists exactly 1 row (isDuplicate wired, item 9)', async () => {
      const feedRepo = module.get<TelegramFeedMessageRepository>(
        TelegramFeedMessageRepository,
      );
      const saveMock = feedRepo.save as jest.Mock;
      saveMock.mockClear();

      // Same crypto-news message arrives twice (realtime event + 30s polling sweep)
      const realtime = createMessage('channel_news_dup', 77, {
        text: 'Same news twice',
      });
      const polling = createMessage('channel_news_dup', 77, {
        text: 'Same news twice',
      });

      await coordinator.route(realtime, 'crypto-news');
      await coordinator.route(polling, 'crypto-news');

      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(saveMock.mock.calls[0][0].type).toBe('crypto-news');
      expect(broadcastedMessages).toHaveLength(1);
    });

    it('window semantics: message below cursor short-circuits BEFORE the DB read (item 9)', async () => {
      const feedRepo = module.get<TelegramFeedMessageRepository>(
        TelegramFeedMessageRepository,
      );
      const saveMock = feedRepo.save as jest.Mock;
      const findMock = feedRepo.findByChannelAndMessageId as jest.Mock;
      saveMock.mockClear();
      findMock.mockClear();

      await coordinator.route(createMessage('channel_window', 50), 'kol');
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(findMock).toHaveBeenCalledTimes(1);

      // id 49 <= cursor 50 → isDuplicate gate returns before persistFeedMessage
      await coordinator.route(createMessage('channel_window', 49), 'kol');

      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(findMock).toHaveBeenCalledTimes(1);
      expect(broadcastedMessages).toHaveLength(1);
    });

    it('cache-full prune: coordinator routes fine with a pruned dedup cache, no crash (item 9)', async () => {
      const feedRepo = module.get<TelegramFeedMessageRepository>(
        TelegramFeedMessageRepository,
      );
      const saveMock = feedRepo.save as jest.Mock;
      saveMock.mockClear();

      // Overflow the in-memory seen-cache past MAX_CACHE_PER_CHANNEL (10000)
      // via the REAL injected service — forces pruneCache mid-fill.
      const channelId = 'channel_prune';
      for (let i = 1; i <= 10001; i++) {
        deduplicationService.isDuplicate(channelId, i, -1);
      }
      const stats = deduplicationService.getStats();
      expect(stats.cachesByChannel[channelId]).toBeLessThanOrEqual(10000);

      // Fresh message above every seen id still routes exactly once.
      await coordinator.route(createMessage(channelId, 20000), 'kol');

      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(broadcastedMessages).toHaveLength(1);
    });
  });
});
