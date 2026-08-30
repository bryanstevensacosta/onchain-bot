import { Test, TestingModule } from '@nestjs/testing';
import { DeduplicationService } from './deduplication.service';
import { LastSeenManager } from '../../infrastructure/services/last-seen-manager.service';
import { RedisService } from '../../../../shared/common/cache/redis.service';

describe('DeduplicationService - Integration Tests', () => {
  let service: DeduplicationService;
  let lastSeenManager: LastSeenManager;
  let redisService: RedisService;
  let module: TestingModule;

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

  beforeEach(async () => {
    // Clear mock Redis store
    mockRedisStore.clear();
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        DeduplicationService,
        LastSeenManager,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<DeduplicationService>(DeduplicationService);
    lastSeenManager = module.get<LastSeenManager>(LastSeenManager);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Duplicate Detection - Cursor Based (Invariant 3)', () => {
    it('should mark first message as not duplicate', () => {
      const channelId = 'channel_001';
      const messageId = 100;
      const highestSeen = -1; // No messages seen yet

      const isDupe = service.isDuplicate(channelId, messageId, highestSeen);

      expect(isDupe).toBe(false);
    });

    it('should detect duplicate when messageId <= highestSeen', () => {
      const channelId = 'channel_001';
      const highestSeen = 100;

      // Test messageId < highestSeen
      const isDupe1 = service.isDuplicate(channelId, 50, highestSeen);
      expect(isDupe1).toBe(true);

      // Test messageId = highestSeen
      const isDupe2 = service.isDuplicate(channelId, 100, highestSeen);
      expect(isDupe2).toBe(true);
    });

    it('should NOT detect duplicate when messageId > highestSeen', () => {
      const channelId = 'channel_001';
      const highestSeen = 100;

      const isDupe = service.isDuplicate(channelId, 101, highestSeen);

      expect(isDupe).toBe(false);
    });

    it('should handle multiple channels independently', () => {
      const channel1 = 'channel_001';
      const channel2 = 'channel_002';

      // Channel 1: seen up to 100
      service.isDuplicate(channel1, 100, -1);

      // Channel 2: seen up to 50
      service.isDuplicate(channel2, 50, -1);

      // New message 101 in channel 1 should not be duplicate
      expect(service.isDuplicate(channel1, 101, 100)).toBe(false);

      // New message 51 in channel 2 should not be duplicate
      expect(service.isDuplicate(channel2, 51, 50)).toBe(false);

      // Old message 99 in channel 1 should be duplicate
      expect(service.isDuplicate(channel1, 99, 100)).toBe(true);
    });
  });

  describe('Duplicate Detection - In-Memory Cache (Out-of-Order)', () => {
    it('should detect duplicate using in-memory cache for out-of-order arrivals', () => {
      const channelId = 'channel_001';
      const messageId = 105;
      const highestSeen = 100;

      // First arrival - not a duplicate
      const isDupe1 = service.isDuplicate(channelId, messageId, highestSeen);
      expect(isDupe1).toBe(false);

      // Second arrival - should be detected by cache
      const isDupe2 = service.isDuplicate(channelId, messageId, highestSeen);
      expect(isDupe2).toBe(true);
    });

    it('should handle messages arriving out of order', () => {
      const channelId = 'channel_001';
      const highestSeen = 100;

      // Messages arrive: 105, 103, 107, 103 (out of order)
      expect(service.isDuplicate(channelId, 105, highestSeen)).toBe(false);
      expect(service.isDuplicate(channelId, 103, highestSeen)).toBe(false);
      expect(service.isDuplicate(channelId, 107, highestSeen)).toBe(false);

      // 103 arrives again - cache should detect it
      expect(service.isDuplicate(channelId, 103, highestSeen)).toBe(true);
    });

    it('should prune cache when size exceeds MAX_CACHE_PER_CHANNEL', () => {
      const channelId = 'channel_large';
      const highestSeen = -1;

      // Add 10001 messages to trigger pruning (MAX is 10000)
      for (let i = 1; i <= 10001; i++) {
        service.isDuplicate(channelId, i, -1);
      }

      const stats = service.getStats();

      // After pruning, should keep ~50% = 5000 entries
      expect(stats.cachesByChannel[channelId]).toBeLessThanOrEqual(5000);
      expect(stats.cachesByChannel[channelId]).toBeGreaterThan(4900);
    });

    it('should keep newest entries after pruning', () => {
      const channelId = 'channel_prune';

      // Add 10001 messages
      for (let i = 1; i <= 10001; i++) {
        service.isDuplicate(channelId, i, -1);
      }

      // Oldest entries (1-5000) should be pruned
      // Newest entries (5001-10001) should remain
      expect(service.isDuplicate(channelId, 10001, -1)).toBe(true); // Still in cache
      expect(service.isDuplicate(channelId, 9000, -1)).toBe(true); // Still in cache
    });
  });

  describe('Cursor Persistence - Redis Integration (Invariant 6)', () => {
    it('should load cursor from Redis on initialization', async () => {
      const channelId = 'channel_persist';
      const lastSeenId = 500;

      // Simulate Redis having a persisted cursor
      const key = `ingestion:lastSeen:${channelId}`;
      mockRedisStore.set(key, lastSeenId.toString());

      // Load from Redis
      await lastSeenManager.load([channelId]);

      // Verify cursor was loaded
      const loaded = lastSeenManager.get(channelId);
      expect(loaded).toBe(lastSeenId);

      // Messages <= 500 should be duplicates
      expect(service.isDuplicate(channelId, 499, loaded)).toBe(true);
      expect(service.isDuplicate(channelId, 500, loaded)).toBe(true);

      // Messages > 500 should not be duplicates
      expect(service.isDuplicate(channelId, 501, loaded)).toBe(false);
    });

    it('should persist cursor to Redis after processing messages', async () => {
      const channelId = 'channel_persist_write';
      const messageId = 750;

      // Set cursor in memory
      lastSeenManager.set(channelId, messageId);

      // Persist to Redis
      await lastSeenManager.persist(channelId, messageId);

      // Verify Redis was called with correct key and value
      const expectedKey = `ingestion:lastSeen:${channelId}`;
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expectedKey,
        messageId.toString(),
      );

      // Verify value is in mock store
      expect(mockRedisStore.get(expectedKey)).toBe(messageId.toString());
    });

    it('should survive service restart - no re-broadcast of old messages', async () => {
      const channelId = 'channel_restart';

      // === Phase 1: Initial run ===
      // Process messages 1-100
      for (let i = 1; i <= 100; i++) {
        service.isDuplicate(channelId, i, i - 1);
        lastSeenManager.set(channelId, i);
        await lastSeenManager.persist(channelId, i);
      }

      // Clear in-memory caches (simulate restart)
      service.clearAll();

      // === Phase 2: After restart ===
      // Reload cursor from Redis
      await lastSeenManager.load([channelId]);
      const highestSeen = lastSeenManager.get(channelId);

      expect(highestSeen).toBe(100);

      // Old messages 1-100 should be detected as duplicates
      for (let i = 1; i <= 100; i++) {
        expect(service.isDuplicate(channelId, i, highestSeen)).toBe(true);
      }

      // New message 101 should NOT be duplicate
      expect(service.isDuplicate(channelId, 101, highestSeen)).toBe(false);
    });

    it('should handle missing Redis keys gracefully', async () => {
      const channelId = 'channel_new';

      // Load from Redis (no key exists)
      await lastSeenManager.load([channelId]);

      // Should default to -1
      const loaded = lastSeenManager.get(channelId);
      expect(loaded).toBe(-1);

      // First message should not be duplicate
      expect(service.isDuplicate(channelId, 1, loaded)).toBe(false);
    });

    it('should normalize channel IDs in Redis keys', async () => {
      const channelWithPrefix = '@cryptonews';
      const channelWithDash = '-1001234567890';
      const messageId = 42;

      // Persist both
      await lastSeenManager.persist(channelWithPrefix, messageId);
      await lastSeenManager.persist(channelWithDash, messageId);

      // Verify normalized keys in Redis
      expect(mockRedisStore.has('ingestion:lastSeen:cryptonews')).toBe(true);
      expect(mockRedisStore.has('ingestion:lastSeen:1234567890')).toBe(true);
    });
  });

  describe('Cache Management', () => {
    it('should clear specific channel cache', () => {
      const channel1 = 'channel_clear_1';
      const channel2 = 'channel_clear_2';

      // Add messages to both channels
      service.isDuplicate(channel1, 1, -1);
      service.isDuplicate(channel1, 2, -1);
      service.isDuplicate(channel2, 1, -1);
      service.isDuplicate(channel2, 2, -1);

      let stats = service.getStats();
      expect(stats.cachesByChannel[channel1]).toBe(2);
      expect(stats.cachesByChannel[channel2]).toBe(2);

      // Clear channel1 only
      service.clearChannel(channel1);

      stats = service.getStats();
      expect(stats.cachesByChannel[channel1]).toBeUndefined();
      expect(stats.cachesByChannel[channel2]).toBe(2);
    });

    it('should clear all caches', () => {
      // Add messages to multiple channels
      service.isDuplicate('channel_1', 1, -1);
      service.isDuplicate('channel_2', 1, -1);
      service.isDuplicate('channel_3', 1, -1);

      let stats = service.getStats();
      expect(stats.channels).toBe(3);
      expect(stats.totalMessages).toBe(3);

      // Clear all
      service.clearAll();

      stats = service.getStats();
      expect(stats.channels).toBe(0);
      expect(stats.totalMessages).toBe(0);
    });

    it('should provide accurate cache statistics', () => {
      const channel1 = 'channel_stats_1';
      const channel2 = 'channel_stats_2';

      // Add 5 messages to channel1
      for (let i = 1; i <= 5; i++) {
        service.isDuplicate(channel1, i, -1);
      }

      // Add 3 messages to channel2
      for (let i = 1; i <= 3; i++) {
        service.isDuplicate(channel2, i, -1);
      }

      const stats = service.getStats();

      expect(stats.channels).toBe(2);
      expect(stats.totalMessages).toBe(8);
      expect(stats.cachesByChannel[channel1]).toBe(5);
      expect(stats.cachesByChannel[channel2]).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle messageId = 0', () => {
      const channelId = 'channel_zero';

      // messageId 0 with highestSeen -1 should not be duplicate
      expect(service.isDuplicate(channelId, 0, -1)).toBe(false);

      // messageId 0 with highestSeen 0 should be duplicate
      expect(service.isDuplicate(channelId, 0, 0)).toBe(true);
    });

    it('should handle very large messageIds', () => {
      const channelId = 'channel_large_ids';
      const largeId = Number.MAX_SAFE_INTEGER;

      expect(service.isDuplicate(channelId, largeId, largeId - 1)).toBe(false);
      expect(service.isDuplicate(channelId, largeId, largeId)).toBe(true);
    });

    it('should handle Redis being disabled', async () => {
      // Mock Redis as disabled
      mockRedisService.isEnabled.mockReturnValue(false);

      const channelId = 'channel_no_redis';
      const messageId = 123;

      // Persist should not throw
      await expect(
        lastSeenManager.persist(channelId, messageId),
      ).resolves.not.toThrow();

      // Deduplication should still work with in-memory cache only
      expect(service.isDuplicate(channelId, messageId, -1)).toBe(false);
      expect(service.isDuplicate(channelId, messageId, -1)).toBe(true);
    });

    it('should handle Redis errors gracefully during persist', async () => {
      const channelId = 'channel_redis_error';
      const messageId = 456;

      // Mock Redis set to throw error
      mockRedisService.set.mockRejectedValueOnce(
        new Error('Redis unavailable'),
      );

      // Should not throw - logs warning instead
      await expect(
        lastSeenManager.persist(channelId, messageId),
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
    });

    it('should ignore invalid cached values from Redis', async () => {
      const channelId = 'channel_invalid';

      // Store invalid value in Redis
      mockRedisStore.set('ingestion:lastSeen:channel_invalid', 'not-a-number');

      await lastSeenManager.load([channelId]);

      // Should default to -1 for invalid value
      expect(lastSeenManager.get(channelId)).toBe(-1);
    });
  });

  describe('Two-Tier Deduplication Strategy', () => {
    it('should use cursor for most common case (sequential messages)', () => {
      const channelId = 'channel_sequential';

      // Simulate normal sequential processing
      for (let i = 1; i <= 100; i++) {
        const isDupe = service.isDuplicate(channelId, i, i - 1);
        expect(isDupe).toBe(false);
      }

      // All messages below 100 should be caught by cursor
      for (let i = 1; i <= 100; i++) {
        const isDupe = service.isDuplicate(channelId, i, 100);
        expect(isDupe).toBe(true);
      }
    });

    it('should use in-memory cache for out-of-order within same poll', () => {
      const channelId = 'channel_out_of_order';
      const highestSeen = 100;

      // Messages arrive out of order: 105, 103, 107, 103
      expect(service.isDuplicate(channelId, 105, highestSeen)).toBe(false);
      expect(service.isDuplicate(channelId, 103, highestSeen)).toBe(false);
      expect(service.isDuplicate(channelId, 107, highestSeen)).toBe(false);

      // Second 103 caught by in-memory cache (not cursor)
      expect(service.isDuplicate(channelId, 103, highestSeen)).toBe(true);
    });

    it('should combine cursor + cache correctly', () => {
      const channelId = 'channel_combined';

      // Initial state: cursor at 50, cache empty
      let highestSeen = 50;

      // Message 30 - caught by cursor
      expect(service.isDuplicate(channelId, 30, highestSeen)).toBe(true);

      // Message 51 - new, added to cache
      expect(service.isDuplicate(channelId, 51, highestSeen)).toBe(false);

      // Message 51 again - caught by cache
      expect(service.isDuplicate(channelId, 51, highestSeen)).toBe(true);

      // Update cursor
      highestSeen = 51;

      // Message 51 - now caught by cursor instead
      expect(service.isDuplicate(channelId, 51, highestSeen)).toBe(true);
    });
  });
});
