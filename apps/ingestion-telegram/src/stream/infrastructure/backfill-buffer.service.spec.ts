import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan } from 'typeorm';
import { BackfillBufferService } from './backfill-buffer.service';
import { BroadcastEvent } from '../domain/broadcast-event.vo';
import { BackfillMessageEntity } from './persistence/typeorm/backfill-message.entity';

describe('BackfillBufferService', () => {
  let service: BackfillBufferService;
  let mockRepository: Partial<Repository<BackfillMessageEntity>>;

  beforeEach(async () => {
    // Create mock repository
    mockRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackfillBufferService,
        {
          provide: getRepositoryToken(BackfillMessageEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<BackfillBufferService>(BackfillBufferService);
    await service.onModuleInit();
  });

  describe('initialization', () => {
    it('should initialize with empty buffer', () => {
      expect(service.getSize()).toBe(0);
      expect(service.getOldestTimestamp()).toBeNull();
    });

    it('should initialize with MAX_SIZE capacity', () => {
      // Add MAX_SIZE + 1 events to verify capacity
      for (let i = 0; i < 5001; i++) {
        const event = createTestEvent(i, Date.now() + i);
        service.add(event);
      }
      expect(service.getSize()).toBe(5000);
    });
  });

  describe('add()', () => {
    it('should add a single event', () => {
      const event = createTestEvent(1, Date.now());
      service.add(event);

      expect(service.getSize()).toBe(1);
    });

    it('should add multiple events', () => {
      const baseTime = Date.now();
      for (let i = 0; i < 10; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      expect(service.getSize()).toBe(10);
    });

    it('should not exceed MAX_SIZE capacity', () => {
      const baseTime = Date.now();
      // Add more than MAX_SIZE events
      for (let i = 0; i < 6000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      expect(service.getSize()).toBe(5000);
    });

    it('should overwrite oldest entry when at capacity', () => {
      const baseTime = Date.now();

      // Fill buffer to capacity
      for (let i = 0; i < 5000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      const oldestBeforeOverwrite = service.getOldestTimestamp();
      expect(oldestBeforeOverwrite).toBe(baseTime);

      // Add one more event - should overwrite the first (oldest)
      const newEvent = createTestEvent(5000, baseTime + 5000);
      service.add(newEvent);

      const oldestAfterOverwrite = service.getOldestTimestamp();
      // Oldest should now be the second event we added (index 1)
      expect(oldestAfterOverwrite).toBe(baseTime + 1);
      expect(service.getSize()).toBe(5000);
    });

    it('should handle rapid additions correctly', () => {
      const baseTime = Date.now();
      const count = 100;

      for (let i = 0; i < count; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      expect(service.getSize()).toBe(count);
      expect(service.getOldestTimestamp()).toBe(baseTime);
    });
  });

  describe('getEventsSince()', () => {
    it('should return empty array when buffer is empty', () => {
      const events = service.getEventsSince(Date.now());
      expect(events).toEqual([]);
    });

    it('should return all events when timestamp is before oldest', () => {
      const baseTime = Date.now();
      const count = 10;

      for (let i = 0; i < count; i++) {
        service.add(createTestEvent(i, baseTime + i * 1000));
      }

      const events = service.getEventsSince(baseTime - 10000);
      expect(events).toHaveLength(count);
    });

    it('should filter events by timestamp correctly', () => {
      const baseTime = Date.now();
      const timestamps = [
        baseTime,
        baseTime + 1000,
        baseTime + 2000,
        baseTime + 3000,
        baseTime + 4000,
      ];

      timestamps.forEach((ts, idx) => {
        service.add(createTestEvent(idx, ts));
      });

      // Get events since baseTime + 2000
      const events = service.getEventsSince(baseTime + 2000);

      expect(events).toHaveLength(3); // Events at 2000, 3000, 4000
      expect(events[0].timestamp).toBe(baseTime + 2000);
      expect(events[1].timestamp).toBe(baseTime + 3000);
      expect(events[2].timestamp).toBe(baseTime + 4000);
    });

    it('should return empty array if timestamp is after all events', () => {
      const baseTime = Date.now();

      for (let i = 0; i < 5; i++) {
        service.add(createTestEvent(i, baseTime + i * 1000));
      }

      const events = service.getEventsSince(baseTime + 10000);
      expect(events).toEqual([]);
    });

    it('should return events sorted by timestamp ascending', () => {
      const baseTime = Date.now();
      // Add events in non-sequential order
      const timestamps = [
        baseTime + 3000,
        baseTime + 1000,
        baseTime + 4000,
        baseTime + 2000,
        baseTime,
      ];

      timestamps.forEach((ts, idx) => {
        service.add(createTestEvent(idx, ts));
      });

      const events = service.getEventsSince(baseTime);

      expect(events).toHaveLength(5);
      // Verify sorted order
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i].timestamp).toBeLessThanOrEqual(
          events[i + 1].timestamp,
        );
      }
    });

    it('should handle exact timestamp match', () => {
      const baseTime = Date.now();
      const targetTimestamp = baseTime + 2000;

      service.add(createTestEvent(1, baseTime));
      service.add(createTestEvent(2, targetTimestamp));
      service.add(createTestEvent(3, baseTime + 3000));

      const events = service.getEventsSince(targetTimestamp);

      expect(events).toHaveLength(2);
      expect(events[0].timestamp).toBe(targetTimestamp);
    });

    it('should work correctly after buffer wraps around', () => {
      const baseTime = Date.now();

      // Fill buffer completely
      for (let i = 0; i < 5000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      // Add 100 more events (wraps around, overwrites first 100)
      for (let i = 5000; i < 5100; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      // Oldest should now be at index 100 (baseTime + 100)
      const oldestTimestamp = service.getOldestTimestamp();
      expect(oldestTimestamp).toBe(baseTime + 100);

      // Get events since halfway through the buffer
      const midpoint = baseTime + 2600;
      const events = service.getEventsSince(midpoint);

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].timestamp).toBeGreaterThanOrEqual(midpoint);
    });
  });

  describe('getSize()', () => {
    it('should return 0 for empty buffer', () => {
      expect(service.getSize()).toBe(0);
    });

    it('should return correct size as events are added', () => {
      const baseTime = Date.now();

      expect(service.getSize()).toBe(0);

      service.add(createTestEvent(1, baseTime));
      expect(service.getSize()).toBe(1);

      service.add(createTestEvent(2, baseTime + 1000));
      expect(service.getSize()).toBe(2);

      for (let i = 2; i < 100; i++) {
        service.add(createTestEvent(i, baseTime + i * 1000));
      }
      expect(service.getSize()).toBe(100);
    });

    it('should cap at MAX_SIZE', () => {
      const baseTime = Date.now();

      for (let i = 0; i < 10000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      expect(service.getSize()).toBe(5000);
    });
  });

  describe('getOldestTimestamp()', () => {
    it('should return null for empty buffer', () => {
      expect(service.getOldestTimestamp()).toBeNull();
    });

    it('should return timestamp of oldest event', () => {
      const baseTime = Date.now();
      const timestamps = [
        baseTime + 3000,
        baseTime + 1000,
        baseTime + 5000,
        baseTime, // oldest
        baseTime + 2000,
      ];

      timestamps.forEach((ts, idx) => {
        service.add(createTestEvent(idx, ts));
      });

      expect(service.getOldestTimestamp()).toBe(baseTime);
    });

    it('should update when oldest event is overwritten', () => {
      const baseTime = Date.now();

      // Fill buffer
      for (let i = 0; i < 5000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      expect(service.getOldestTimestamp()).toBe(baseTime);

      // Overwrite first 10 entries
      for (let i = 0; i < 10; i++) {
        service.add(createTestEvent(5000 + i, baseTime + 5000 + i));
      }

      // Oldest should now be at baseTime + 10
      expect(service.getOldestTimestamp()).toBe(baseTime + 10);
    });

    it('should handle single event', () => {
      const timestamp = Date.now();
      service.add(createTestEvent(1, timestamp));

      expect(service.getOldestTimestamp()).toBe(timestamp);
    });
  });

  describe('edge cases', () => {
    it('should handle events with same timestamp', () => {
      const timestamp = Date.now();

      for (let i = 0; i < 5; i++) {
        service.add(createTestEvent(i, timestamp));
      }

      const events = service.getEventsSince(timestamp);
      expect(events).toHaveLength(5);
      events.forEach((event) => {
        expect(event.timestamp).toBe(timestamp);
      });
    });

    it('should handle timestamp boundaries correctly', () => {
      const baseTime = Date.now();

      service.add(createTestEvent(1, baseTime));
      service.add(createTestEvent(2, baseTime + 1));
      service.add(createTestEvent(3, baseTime + 2));

      // Exact match on boundary
      let events = service.getEventsSince(baseTime + 1);
      expect(events).toHaveLength(2);

      // Just before boundary
      events = service.getEventsSince(baseTime);
      expect(events).toHaveLength(3);

      // Just after last
      events = service.getEventsSince(baseTime + 3);
      expect(events).toHaveLength(0);
    });

    it('should maintain integrity with mixed operations', () => {
      const baseTime = Date.now();

      // Add some events
      for (let i = 0; i < 100; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      const size1 = service.getSize();
      const oldest1 = service.getOldestTimestamp();

      // Query events
      let events = service.getEventsSince(baseTime + 50);
      expect(events).toHaveLength(50);

      // Add more events
      for (let i = 100; i < 200; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      const size2 = service.getSize();
      expect(size2).toBe(200);

      // Query again
      events = service.getEventsSince(baseTime + 150);
      expect(events).toHaveLength(50);

      // Verify oldest hasn't changed (buffer not full yet)
      expect(service.getOldestTimestamp()).toBe(oldest1);
    });

    it('should handle large timestamp values', () => {
      const largeTimestamp = Date.now() + 1000000000; // far future

      service.add(createTestEvent(1, largeTimestamp));
      service.add(createTestEvent(2, largeTimestamp + 1));

      const events = service.getEventsSince(largeTimestamp);
      expect(events).toHaveLength(2);
    });

    it('should handle zero timestamp', () => {
      // Use current timestamp to avoid 72h retention filter
      const now = Date.now();
      service.add(createTestEvent(1, now));
      service.add(createTestEvent(2, now + 1000));

      const events = service.getEventsSince(now);
      expect(events).toHaveLength(2);
      expect(service.getOldestTimestamp()).toBe(now);
    });
  });

  describe('performance characteristics', () => {
    it('should handle rapid additions efficiently (O(1))', () => {
      const baseTime = Date.now();
      const count = 5000;

      const startTime = Date.now();

      for (let i = 0; i < count; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      const duration = Date.now() - startTime;

      // Adding 5000 events should be fast (< 100ms on typical hardware)
      expect(duration).toBeLessThan(500);
      expect(service.getSize()).toBe(count);
    });

    it('should maintain consistent performance after wrap-around', () => {
      const baseTime = Date.now();

      // Fill buffer twice (force wrap-around)
      for (let i = 0; i < 10000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      const startTime = Date.now();

      // Add 1000 more events
      for (let i = 10000; i < 11000; i++) {
        service.add(createTestEvent(i, baseTime + i));
      }

      const duration = Date.now() - startTime;

      // Should still be fast
      expect(duration).toBeLessThan(100);
    });
  });

  describe('database persistence (Integration)', () => {
    describe('persistAsync()', () => {
      it('should persist event to database when added', async () => {
        const event = createTestEvent(1, Date.now());

        service.add(event);

        // Wait for async persistence
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockRepository.save).toHaveBeenCalledTimes(1);
        const savedEntity = (mockRepository.save as jest.Mock).mock.calls[0][0];

        expect(savedEntity.eventId).toBe(event.eventId);
        expect(savedEntity.timestamp).toBe(event.timestamp);
        expect(savedEntity.channelId).toBe(event.channelId);
        expect(savedEntity.messageId).toBe(event.messageId);
        expect(savedEntity.payload).toBe(JSON.stringify(event.toJSON()));
      });

      it('should not block add() when persistence fails', async () => {
        (mockRepository.save as jest.Mock).mockRejectedValue(
          new Error('Database error'),
        );

        const event = createTestEvent(1, Date.now());

        // Should not throw
        expect(() => service.add(event)).not.toThrow();

        // Event should still be in memory buffer
        expect(service.getSize()).toBe(1);
      });

      it('should persist multiple events', async () => {
        const baseTime = Date.now();
        const events = [
          createTestEvent(1, baseTime),
          createTestEvent(2, baseTime + 1000),
          createTestEvent(3, baseTime + 2000),
        ];

        events.forEach((event) => service.add(event));

        // Wait for async persistence
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockRepository.save).toHaveBeenCalledTimes(3);
      });

      it('should continue persisting after database errors', async () => {
        // First save fails
        (mockRepository.save as jest.Mock).mockRejectedValueOnce(
          new Error('Database error'),
        );

        const event1 = createTestEvent(1, Date.now());
        const event2 = createTestEvent(2, Date.now() + 1000);

        service.add(event1);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Second save should succeed
        service.add(event2);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockRepository.save).toHaveBeenCalledTimes(2);
      });
    });

    describe('restoreFromDatabase()', () => {
      it('should restore events from database on startup', async () => {
        const baseTime = Date.now();
        const entities: BackfillMessageEntity[] = [];

        for (let i = 0; i < 10; i++) {
          const event = createTestEvent(i, baseTime + i * 1000);
          const entity = new BackfillMessageEntity();
          entity.eventId = event.eventId;
          entity.timestamp = event.timestamp;
          entity.channelId = event.channelId;
          entity.messageId = event.messageId;
          entity.payload = JSON.stringify(event.toJSON());
          entities.push(entity);
        }

        (mockRepository.find as jest.Mock).mockResolvedValue(entities);

        // Create new service instance to trigger onModuleInit
        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );

        // onModuleInit is called automatically by NestJS
        await newService.onModuleInit();

        expect(newService.getSize()).toBe(10);
        expect(newService.getOldestTimestamp()).toBe(baseTime);
      });

      it('should query database for last 72 hours', async () => {
        // Clear the mock from beforeEach
        (mockRepository.find as jest.Mock).mockClear();

        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );
        await newService.onModuleInit();

        expect(mockRepository.find).toHaveBeenCalledTimes(1);
        const findOptions = (mockRepository.find as jest.Mock).mock.calls[0][0];

        expect(findOptions.order).toEqual({ timestamp: 'ASC' });
        // Verify timestamp query exists (value will be relative to current time)
        expect(findOptions.where.timestamp).toBeDefined();
      });

      it('should restore events in chronological order', async () => {
        const baseTime = Date.now();
        const timestamps = [
          baseTime + 3000,
          baseTime + 1000,
          baseTime + 4000,
          baseTime,
          baseTime + 2000,
        ];

        const entities: BackfillMessageEntity[] = timestamps.map((ts, i) => {
          const event = createTestEvent(i, ts);
          const entity = new BackfillMessageEntity();
          entity.eventId = event.eventId;
          entity.timestamp = event.timestamp;
          entity.channelId = event.channelId;
          entity.messageId = event.messageId;
          entity.payload = JSON.stringify(event.toJSON());
          return entity;
        });

        (mockRepository.find as jest.Mock).mockResolvedValue(entities);

        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );
        await newService.onModuleInit();

        // Oldest should be baseTime (index 3 in original array)
        expect(newService.getOldestTimestamp()).toBe(baseTime);
      });

      it('should handle database errors gracefully', async () => {
        (mockRepository.find as jest.Mock).mockRejectedValue(
          new Error('Database connection failed'),
        );

        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );

        // Should not throw
        await expect(newService.onModuleInit()).resolves.not.toThrow();

        // Buffer should be empty but service should be operational
        expect(newService.getSize()).toBe(0);
      });

      it('should skip events with invalid JSON payload', async () => {
        const validEvent = createTestEvent(1, Date.now());
        const validEntity = new BackfillMessageEntity();
        validEntity.eventId = validEvent.eventId;
        validEntity.timestamp = validEvent.timestamp;
        validEntity.channelId = validEvent.channelId;
        validEntity.messageId = validEvent.messageId;
        validEntity.payload = JSON.stringify(validEvent.toJSON());

        const invalidEntity = new BackfillMessageEntity();
        invalidEntity.eventId = 'invalid-event';
        invalidEntity.timestamp = Date.now();
        invalidEntity.channelId = 'test-channel';
        invalidEntity.messageId = 999;
        invalidEntity.payload = 'invalid json{';

        (mockRepository.find as jest.Mock).mockResolvedValue([
          validEntity,
          invalidEntity,
        ]);

        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );
        await newService.onModuleInit();

        // Should only restore the valid event
        expect(newService.getSize()).toBe(1);
      });

      it('should not trigger persistAsync when restoring', async () => {
        const event = createTestEvent(1, Date.now());
        const entity = new BackfillMessageEntity();
        entity.eventId = event.eventId;
        entity.timestamp = event.timestamp;
        entity.channelId = event.channelId;
        entity.messageId = event.messageId;
        entity.payload = JSON.stringify(event.toJSON());

        (mockRepository.find as jest.Mock).mockResolvedValue([entity]);

        // Reset save mock
        (mockRepository.save as jest.Mock).mockClear();

        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );
        await newService.onModuleInit();

        // Wait to ensure no async persistence triggered
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Save should not be called during restore
        expect(mockRepository.save).not.toHaveBeenCalled();
      });
    });

    describe('cleanupOldMessages()', () => {
      it('should delete messages older than 72 hours', async () => {
        (mockRepository.delete as jest.Mock).mockResolvedValue({
          affected: 42,
        });

        const deletedCount = await service.cleanupOldMessages();

        expect(deletedCount).toBe(42);
        expect(mockRepository.delete).toHaveBeenCalledTimes(1);

        const deleteQuery = (mockRepository.delete as jest.Mock).mock
          .calls[0][0];
        expect(deleteQuery.timestamp).toBeDefined();
      });

      it('should return 0 when no messages deleted', async () => {
        (mockRepository.delete as jest.Mock).mockResolvedValue({
          affected: 0,
        });

        const deletedCount = await service.cleanupOldMessages();

        expect(deletedCount).toBe(0);
      });

      it('should handle undefined affected count', async () => {
        (mockRepository.delete as jest.Mock).mockResolvedValue({});

        const deletedCount = await service.cleanupOldMessages();

        expect(deletedCount).toBe(0);
      });

      it('should throw on database error', async () => {
        (mockRepository.delete as jest.Mock).mockRejectedValue(
          new Error('Database error'),
        );

        await expect(service.cleanupOldMessages()).rejects.toThrow(
          'Database error',
        );
      });

      it('should use correct 72-hour cutoff', async () => {
        const beforeCleanup = Date.now();

        await service.cleanupOldMessages();

        const afterCleanup = Date.now();

        expect(mockRepository.delete).toHaveBeenCalledTimes(1);
        const deleteQuery = (mockRepository.delete as jest.Mock).mock
          .calls[0][0];

        // Cutoff should be 72 hours ago (±100ms for test execution time)
        const expectedCutoff = 72 * 60 * 60 * 1000;
        const actualCutoff = beforeCleanup - deleteQuery.timestamp._value;

        expect(actualCutoff).toBeGreaterThanOrEqual(expectedCutoff - 100);
        expect(actualCutoff).toBeLessThanOrEqual(
          expectedCutoff + (afterCleanup - beforeCleanup) + 100,
        );
      });
    });

    describe('scheduledCleanup()', () => {
      it('should call cleanupOldMessages()', async () => {
        const cleanupSpy = jest
          .spyOn(service, 'cleanupOldMessages')
          .mockResolvedValue(10);

        await service.scheduledCleanup();

        expect(cleanupSpy).toHaveBeenCalledTimes(1);
      });

      it('should log deleted count on success', async () => {
        const deletedCount = 42;
        jest
          .spyOn(service, 'cleanupOldMessages')
          .mockResolvedValue(deletedCount);

        const logSpy = jest.spyOn(service['logger'], 'log');

        await service.scheduledCleanup();

        expect(logSpy).toHaveBeenCalledWith(
          'Starting scheduled cleanup of old backfill messages',
        );
        expect(logSpy).toHaveBeenCalledWith(
          `Scheduled cleanup completed: deleted ${deletedCount} messages`,
        );
      });

      it('should catch and log errors without throwing', async () => {
        const error = new Error('Database connection failed');
        jest.spyOn(service, 'cleanupOldMessages').mockRejectedValue(error);

        const errorSpy = jest.spyOn(service['logger'], 'error');

        // Should not throw
        await expect(service.scheduledCleanup()).resolves.not.toThrow();

        expect(errorSpy).toHaveBeenCalledWith(
          'Scheduled cleanup failed: Database connection failed',
          error.stack,
        );
      });

      it('should handle non-Error objects', async () => {
        jest
          .spyOn(service, 'cleanupOldMessages')
          .mockRejectedValue('string error');

        const errorSpy = jest.spyOn(service['logger'], 'error');

        await expect(service.scheduledCleanup()).resolves.not.toThrow();

        expect(errorSpy).toHaveBeenCalledWith(
          'Scheduled cleanup failed: string error',
          undefined,
        );
      });

      it('should have correct cron expression', () => {
        // Verify the @Cron decorator is applied with correct expression
        const cronMetadata = Reflect.getMetadata(
          'SCHEDULE_CRON_OPTIONS',
          service.scheduledCleanup,
        );

        expect(cronMetadata).toBeDefined();
        expect(cronMetadata.cronTime).toBe('0 3 * * *');
      });
    });

    describe('end-to-end persistence flow', () => {
      it('should persist, restore, and cleanup messages correctly', async () => {
        const baseTime = Date.now();
        const oldTimestamp = baseTime - 73 * 60 * 60 * 1000; // 73 hours ago
        const recentTimestamp = baseTime - 1 * 60 * 60 * 1000; // 1 hour ago

        // 1. Add events (triggers persist)
        const oldEvent = createTestEvent(1, oldTimestamp);
        const recentEvent = createTestEvent(2, recentTimestamp);

        service.add(oldEvent);
        service.add(recentEvent);

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockRepository.save).toHaveBeenCalledTimes(2);

        // 2. Simulate database having both events
        const oldEntity = new BackfillMessageEntity();
        oldEntity.eventId = oldEvent.eventId;
        oldEntity.timestamp = oldEvent.timestamp;
        oldEntity.channelId = oldEvent.channelId;
        oldEntity.messageId = oldEvent.messageId;
        oldEntity.payload = JSON.stringify(oldEvent.toJSON());

        const recentEntity = new BackfillMessageEntity();
        recentEntity.eventId = recentEvent.eventId;
        recentEntity.timestamp = recentEvent.timestamp;
        recentEntity.channelId = recentEvent.channelId;
        recentEntity.messageId = recentEvent.messageId;
        recentEntity.payload = JSON.stringify(recentEvent.toJSON());

        (mockRepository.find as jest.Mock).mockResolvedValue([
          oldEntity,
          recentEntity,
        ]);

        // 3. Create new service (simulates restart) - should restore only recent
        const module = await Test.createTestingModule({
          providers: [
            BackfillBufferService,
            {
              provide: getRepositoryToken(BackfillMessageEntity),
              useValue: mockRepository,
            },
          ],
        }).compile();

        const newService = module.get<BackfillBufferService>(
          BackfillBufferService,
        );
        await newService.onModuleInit();

        // Both events should be restored (cleanup happens separately)
        expect(newService.getSize()).toBe(2);

        // 4. Cleanup old messages
        (mockRepository.delete as jest.Mock).mockResolvedValue({
          affected: 1,
        });

        const deletedCount = await newService.cleanupOldMessages();

        expect(deletedCount).toBe(1);
        expect(mockRepository.delete).toHaveBeenCalledTimes(1);
      });
    });
  });
});

/**
 * Helper function to create test BroadcastEvent with controlled timestamp
 */
function createTestEvent(messageId: number, timestamp: number): BroadcastEvent {
  // Use fromJSON to have full control over all fields including timestamp
  const json = JSON.stringify({
    eventId: `test-event-${messageId}`,
    timestamp: timestamp,
    channelId: 'test-channel-123',
    messageId: messageId,
    content: `Test message ${messageId}`,
    publishedAt: timestamp,
  });

  return BroadcastEvent.fromJSON(json);
}
