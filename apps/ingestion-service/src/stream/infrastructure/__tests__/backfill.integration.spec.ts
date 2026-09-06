import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackfillBufferService } from '../backfill-buffer.service';
import { SSEBroadcastService } from '../../application/services/sse-broadcast.service';
import { BackfillMessageEntity } from '../persistence/typeorm/backfill-message.entity';
import { BroadcastEvent } from '../../domain/broadcast-event.vo';
import { MetricsService } from '../../../metrics/metrics.service';
import { Registry } from 'prom-client';
import * as http from 'http';

/**
 * Integration Tests: Backfill System (BackfillBufferService + SSEBroadcastService)
 *
 * Validates: Requirements 7.3, 7.4, 7.5
 *
 * These tests validate the complete backfill system by testing:
 * 1. Backend reconnects and receives missed messages
 * 2. Backfill-unavailable when disconnected > 72 hours
 * 3. Buffer overflow during disconnect (oldest messages overwritten)
 * 4. Large backfill (1000+ messages) completes within 10 seconds
 * 5. Backfill order (messages arrive sorted by timestamp, oldest first)
 * 6. Backfill + realtime (real-time messages continue after backfill)
 * 7. Database persistence (backfill survives service restart)
 * 8. Partial backfill (starts from lastSeenTimestamp, not from beginning)
 *
 * Per Requirement 7.3: getEventsSince() filters by timestamp
 * Per Requirement 7.4: O(1) add operation with circular overwrite
 * Per Requirement 7.5: 72-hour retention window
 * Per NFR2: Backfill buffer survives service restarts
 */
describe('Backfill Integration Tests', () => {
  let module: TestingModule;
  let backfillBuffer: BackfillBufferService;
  let sseBroadcast: SSEBroadcastService;
  let repository: Repository<BackfillMessageEntity>;
  let metricsService: MetricsService;

  /**
   * Simple mock HTTP response for SSE testing
   */
  class MockResponse {
    private chunks: string[] = [];
    public writableEnded = false;

    write(chunk: string): boolean {
      this.chunks.push(chunk);
      return true;
    }

    end(): void {
      this.writableEnded = true;
    }

    getChunks(): string[] {
      return this.chunks;
    }

    getEvents(): Array<{ event: string; data: any }> {
      const events: Array<{ event: string; data: any }> = [];

      for (const chunk of this.chunks) {
        const eventMatch = chunk.match(/^event: (.+)$/m);
        const dataMatch = chunk.match(/^data: (.+)$/m);

        if (eventMatch && dataMatch) {
          const event = eventMatch[1];
          const data = JSON.parse(dataMatch[1]);
          events.push({ event, data });
        }
      }

      return events;
    }
  }

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.INGESTION_DATABASE_HOST || 'localhost',
          port: parseInt(process.env.INGESTION_DATABASE_PORT || '5432', 10),
          username: process.env.INGESTION_DATABASE_USER || 'postgres',
          password: process.env.INGESTION_DATABASE_PASSWORD || 'postgres',
          database: process.env.INGESTION_DATABASE_NAME || 'onchain_bot_test',
          entities: [BackfillMessageEntity],
          synchronize: true, // Auto-create tables in test environment
          dropSchema: true, // Clean slate for each test run
        }),
        TypeOrmModule.forFeature([BackfillMessageEntity]),
      ],
      providers: [
        BackfillBufferService,
        SSEBroadcastService,
        MetricsService,
        {
          provide: Registry,
          useValue: new Registry(),
        },
      ],
    }).compile();

    backfillBuffer = module.get<BackfillBufferService>(BackfillBufferService);
    sseBroadcast = module.get<SSEBroadcastService>(SSEBroadcastService);
    repository = module.get<Repository<BackfillMessageEntity>>(
      'BackfillMessageEntityRepository',
    );
    metricsService = module.get<MetricsService>(MetricsService);

    // Wait for BackfillBufferService.onModuleInit to complete
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    // ROBUST cleanup strategy: Poll until DB is actually empty
    // (fire-and-forget persistence makes timing unpredictable)
    
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Clear DB
      try {
        await repository.query('TRUNCATE TABLE backfill_messages CASCADE');
      } catch (error) {
        await repository.clear();
      }
      
      // Wait a bit for any in-flight writes
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Verify DB is empty
      const count = await repository.count();
      if (count === 0) {
        break; // Success! DB is clean
      }
      
      if (attempt === maxAttempts - 1) {
        console.warn(`⚠️  DB still has ${count} records after ${maxAttempts} cleanup attempts`);
      }
    }

    // Recreate BackfillBufferService with fresh in-memory buffer
    backfillBuffer = new BackfillBufferService(repository);
    await backfillBuffer.onModuleInit(); // Restore from now-empty DB
  });

  /**
   * Test 1: Backend reconnects and receives missed messages
   *
   * Validates: Requirement 7.3 - getEventsSince() filters by timestamp
   *
   * Scenario:
   * 1. Add 10 messages to buffer (simulating ingestion while backend is offline)
   * 2. Simulate backend reconnecting with lastSeenTimestamp
   * 3. Retrieve missed messages using getEventsSince()
   * 4. Verify all messages after lastSeenTimestamp are returned
   */
  it('should return missed messages when backend reconnects', async () => {
    // Add 10 messages with incrementing timestamps
    const baseTime = Date.now() - 10000;
    const events: BroadcastEvent[] = [];

    for (let i = 0; i < 10; i++) {
      const eventTimestamp = baseTime + i * 1000; // 1 second apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i + 1,
          text: `Message ${i + 1}`,
          date: Math.floor((baseTime + i * 1000) / 1000),
        },
        undefined, // no mediaPath
        eventTimestamp, // controlled timestamp
      );
      backfillBuffer.add(event);
      events.push(event);
    }

    // Simulate backend reconnecting - it last saw message at timestamp of 5th message
    const lastSeenTimestamp = events[4].timestamp;

    // Get missed messages (should be messages 6-10)
    const missedMessages = backfillBuffer.getEventsSince(lastSeenTimestamp + 1);

    // Verify we got the correct messages
    expect(missedMessages.length).toBe(5);
    expect(missedMessages[0].messageId).toBe(6);
    expect(missedMessages[4].messageId).toBe(10);

    // Verify messages are sorted by timestamp (oldest first)
    for (let i = 1; i < missedMessages.length; i++) {
      expect(missedMessages[i].timestamp).toBeGreaterThan(
        missedMessages[i - 1].timestamp,
      );
    }
  });

  /**
   * Test 2: Backfill-unavailable when disconnected > 72 hours
   *
   * Validates: Requirement 7.5 - 72-hour retention window
   *
   * Scenario:
   * 1. Add messages with timestamps older than 72 hours
   * 2. Backend reconnects with lastSeenTimestamp > 72 hours ago
   * 3. Verify getEventsSince() returns empty array (all messages expired)
   */
  it('should return empty array when backend disconnected > 72 hours', async () => {
    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

    // Add messages that are 73 hours old
    const oldTimestamp = Date.now() - SEVENTY_TWO_HOURS_MS - 3600000;

    for (let i = 0; i < 5; i++) {
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i + 1,
          text: `Old message ${i + 1}`,
          date: Math.floor(oldTimestamp / 1000),
        },
        undefined, // no mediaPath
        oldTimestamp, // controlled old timestamp
      );
      backfillBuffer.add(event);
    }

    // Backend reconnects with lastSeenTimestamp from 73 hours ago
    const lastSeenTimestamp = oldTimestamp;
    const missedMessages = backfillBuffer.getEventsSince(lastSeenTimestamp);

    // Should return empty - all messages are outside the 72-hour window
    expect(missedMessages.length).toBe(0);
  });

  /**
   * Test 3: Buffer overflow during disconnect (oldest messages overwritten)
   *
   * Validates: Requirement 7.4 - Circular buffer with 5000 message capacity
   *
   * Scenario:
   * 1. Fill buffer beyond capacity (5000+ messages)
   * 2. Verify oldest messages are overwritten
   * 3. Verify newest messages are retained
   */
  it('should overwrite oldest messages when buffer exceeds 5000 capacity', async () => {
    // Add 5010 messages to trigger overflow
    const MESSAGE_COUNT = 5010;
    const baseTime = Date.now();

    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const eventTimestamp = baseTime + i * 100; // 100ms apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i + 1,
          text: `Message ${i + 1}`,
          date: Math.floor((baseTime + i * 100) / 1000),
        },
        undefined, // no mediaPath
        eventTimestamp, // controlled timestamp
      );
      backfillBuffer.add(event);
    }

    // Buffer should be at capacity (5000)
    expect(backfillBuffer.getSize()).toBe(5000);

    // Get all messages from the beginning
    const allMessages = backfillBuffer.getEventsSince(0);

    // Should have exactly 5000 messages
    expect(allMessages.length).toBe(5000);

    // Oldest messages (1-10) should be lost, newest (5001-5010) retained
    const oldestRetained = allMessages[0].messageId;
    const newestRetained = allMessages[allMessages.length - 1].messageId;

    expect(oldestRetained).toBeGreaterThan(10);
    expect(newestRetained).toBe(MESSAGE_COUNT);
  });

  /**
   * Test 4: Large backfill (1000+ messages) completes within 10 seconds
   *
   * Validates: NFR1 - Backend reconnection with backfill completes within 10s for 1000 messages
   *
   * Scenario:
   * 1. Add 1000 messages to buffer
   * 2. Measure time to retrieve all messages via getEventsSince()
   * 3. Verify operation completes within 10 seconds
   */
  it('should complete large backfill of 1000+ messages within 10 seconds', async () => {
    const MESSAGE_COUNT = 1000;
    const baseTime = Date.now();

    // Add 1000 messages
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const eventTimestamp = baseTime + i * 100; // 100ms apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i + 1,
          text: `Message ${i + 1}`,
          date: Math.floor((baseTime + i * 100) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }

    // Measure backfill retrieval time
    const startTime = Date.now();
    const messages = backfillBuffer.getEventsSince(0);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify all messages retrieved
    expect(messages.length).toBe(MESSAGE_COUNT);

    // Verify performance: should complete within 10 seconds
    expect(duration).toBeLessThan(10000);

    // Log actual performance for monitoring
    console.log(
      `Large backfill performance: ${MESSAGE_COUNT} messages in ${duration}ms`,
    );
  });

  /**
   * Test 5: Backfill order (messages arrive sorted by timestamp, oldest first)
   *
   * Validates: Requirement 7.3 - Messages returned in chronological order
   *
   * Scenario:
   * 1. Add messages in random timestamp order
   * 2. Retrieve messages via getEventsSince()
   * 3. Verify messages are sorted by timestamp (oldest first)
   */
  it('should return messages sorted by timestamp (oldest first)', async () => {
    const baseTime = Date.now();
    const timestamps = [5, 1, 8, 3, 9, 2, 7, 4, 6, 10];

    // Add messages in random timestamp order
    for (const ts of timestamps) {
      const eventTimestamp = baseTime + ts * 1000; // controlled timestamp
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: ts,
          text: `Message ${ts}`,
          date: Math.floor((baseTime + ts * 1000) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }

    // Retrieve all messages
    const messages = backfillBuffer.getEventsSince(0);

    // Verify messages are sorted by timestamp
    expect(messages.length).toBe(10);

    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].timestamp).toBeGreaterThan(
        messages[i - 1].timestamp,
      );
    }

    // Verify specific order: should be 1, 2, 3, ..., 10
    expect(messages.map((m) => m.messageId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  /**
   * Test 6: Backfill + realtime (real-time messages continue after backfill)
   *
   * Validates: Integration of backfill and real-time streaming
   *
   * Scenario:
   * 1. Add historical messages to buffer
   * 2. Simulate backend reconnecting and retrieving backfill
   * 3. Add new real-time messages
   * 4. Verify backend can retrieve new messages after backfill
   */
  it('should continue receiving real-time messages after backfill', async () => {
    const baseTime = Date.now();

    // Add 5 historical messages
    for (let i = 1; i <= 5; i++) {
      const eventTimestamp = baseTime - 10000 + i * 1000; // historical timestamps
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i,
          text: `Historical ${i}`,
          date: Math.floor((baseTime - 10000 + i * 1000) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }

    // Backend reconnects and retrieves backfill
    const lastSeenTimestamp = baseTime - 10000;
    const backfillMessages = backfillBuffer.getEventsSince(lastSeenTimestamp);

    expect(backfillMessages.length).toBe(5);

    // Add 3 new real-time messages
    for (let i = 6; i <= 8; i++) {
      const eventTimestamp = baseTime + i * 1000; // realtime timestamps
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i,
          text: `Realtime ${i}`,
          date: Math.floor((baseTime + i * 1000) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }

    // Backend retrieves messages after the last backfill message
    const lastBackfillTimestamp =
      backfillMessages[backfillMessages.length - 1].timestamp;
    const realtimeMessages = backfillBuffer.getEventsSince(
      lastBackfillTimestamp + 1,
    );

    // Should get the 3 new real-time messages
    expect(realtimeMessages.length).toBe(3);
    expect(realtimeMessages.map((m) => m.messageId)).toEqual([6, 7, 8]);
  });

  /**
   * Test 7: Database persistence (backfill survives service restart)
   *
   * Validates: Requirement 7.2 - Database persistence for restart recovery
   * Validates: NFR2 - Backfill buffer survives Ingestion_Service restarts
   *
   * Scenario:
   * 1. Add messages to buffer
   * 2. Verify messages are persisted to database
   * 3. Create new BackfillBufferService instance (simulating restart)
   * 4. Verify messages are restored from database
   */
  it('should persist messages to database and restore after restart', async () => {
    const baseTime = Date.now();

    // Add 10 messages to buffer
    for (let i = 1; i <= 10; i++) {
      const eventTimestamp = baseTime + i * 1000; // 1 second apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i,
          text: `Persistent message ${i}`,
          date: Math.floor((baseTime + i * 1000) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }

    // Wait for async database persistence (fire-and-forget, need time to complete)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify messages are in database
    const dbMessages = await repository.find();
    expect(dbMessages.length).toBe(10);

    // Create new BackfillBufferService instance (simulating restart)
    const newBuffer = new BackfillBufferService(repository);
    await newBuffer.onModuleInit();

    // Wait for restoration to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify messages are restored
    const restoredMessages = newBuffer.getEventsSince(0);
    expect(restoredMessages.length).toBe(10);
    expect(restoredMessages.map((m) => m.messageId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    // Verify oldest timestamp
    const oldestTimestamp = newBuffer.getOldestTimestamp();
    expect(oldestTimestamp).toBeDefined();
    expect(oldestTimestamp).toBeLessThan(Date.now());
  });

  /**
   * Test 8: Partial backfill (starts from lastSeenTimestamp, not from beginning)
   *
   * Validates: Requirement 7.3 - Efficient timestamp-based filtering
   *
   * Scenario:
   * 1. Add 20 messages to buffer
   * 2. Backend reconnects with lastSeenTimestamp in the middle
   * 3. Verify only messages after lastSeenTimestamp are returned
   * 4. Verify earlier messages are NOT included
   */
  it('should return only messages after lastSeenTimestamp (partial backfill)', async () => {
    const baseTime = Date.now();
    const events: BroadcastEvent[] = [];

    // Add 20 messages
    for (let i = 1; i <= 20; i++) {
      const eventTimestamp = baseTime + i * 1000; // 1 second apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i,
          text: `Message ${i}`,
          date: Math.floor((baseTime + i * 1000) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
      events.push(event);
    }

    // Backend last saw message 12
    const lastSeenTimestamp = events[11].timestamp; // index 11 = message 12

    // Get partial backfill (messages 13-20)
    const partialBackfill = backfillBuffer.getEventsSince(
      lastSeenTimestamp + 1,
    );

    // Should get exactly 8 messages (13-20)
    expect(partialBackfill.length).toBe(8);
    expect(partialBackfill[0].messageId).toBe(13);
    expect(partialBackfill[7].messageId).toBe(20);

    // Verify no earlier messages included
    for (const msg of partialBackfill) {
      expect(msg.messageId).toBeGreaterThan(12);
    }
  });

  /**
   * Test 9: Buffer size tracking
   *
   * Validates: Monitoring and observability of buffer state
   *
   * Scenario:
   * 1. Verify buffer starts empty
   * 2. Add messages and verify size increases
   * 3. Verify getOldestTimestamp returns correct value
   */
  it('should correctly track buffer size and oldest timestamp', async () => {
    // Buffer should start empty
    expect(backfillBuffer.getSize()).toBe(0);
    expect(backfillBuffer.getOldestTimestamp()).toBeNull();

    const baseTime = Date.now();

    // Add 5 messages
    for (let i = 1; i <= 5; i++) {
      const eventTimestamp = baseTime + i * 1000; // 1 second apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i,
          text: `Message ${i}`,
          date: Math.floor((baseTime + i * 1000) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }

    // Verify size
    expect(backfillBuffer.getSize()).toBe(5);

    // Verify oldest timestamp is from first message
    const oldestTimestamp = backfillBuffer.getOldestTimestamp();
    expect(oldestTimestamp).toBeDefined();
    expect(oldestTimestamp).toBeLessThanOrEqual(baseTime + 1000);
  });

  /**
   * Test 10: Cleanup of old messages from database
   *
   * Validates: Requirement 7.5 - 72-hour retention cleanup
   *
   * Scenario:
   * 1. Add messages older than 72 hours to database
   * 2. Add recent messages
   * 3. Run cleanup
   * 4. Verify old messages are deleted, recent ones retained
   */
  it('should cleanup messages older than 72 hours from database', async () => {
    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
    const now = Date.now();

    // Insert 5 old messages DIRECTLY to database with ancient timestamps
    // (bypass backfillBuffer.add which uses Date.now())
    for (let i = 1; i <= 5; i++) {
      const entity = new BackfillMessageEntity();
      entity.eventId = `old-event-${i}`;
      entity.timestamp = now - SEVENTY_TWO_HOURS_MS - 7200000; // 74 hours ago
      entity.channelId = '-1001234567890';
      entity.messageId = i;
      entity.payload = JSON.stringify({
        eventId: `old-event-${i}`,
        timestamp: now - SEVENTY_TWO_HOURS_MS - 7200000,
        channelId: '-1001234567890',
        messageId: i,
        content: `Old message ${i}`,
        publishedAt: now - SEVENTY_TWO_HOURS_MS - 7200000,
      });
      await repository.save(entity);
    }

    // Insert 5 recent messages DIRECTLY to database
    for (let i = 6; i <= 10; i++) {
      const entity = new BackfillMessageEntity();
      entity.eventId = `recent-event-${i}`;
      entity.timestamp = now - 3600000; // 1 hour ago
      entity.channelId = '-1001234567890';
      entity.messageId = i;
      entity.payload = JSON.stringify({
        eventId: `recent-event-${i}`,
        timestamp: now - 3600000,
        channelId: '-1001234567890',
        messageId: i,
        content: `Recent message ${i}`,
        publishedAt: now - 3600000,
      });
      await repository.save(entity);
    }

    // Verify all 10 messages are in database
    let dbMessages = await repository.find();
    expect(dbMessages.length).toBe(10);

    // Run cleanup
    const deletedCount = await backfillBuffer.cleanupOldMessages();

    // Should have deleted 5 old messages
    expect(deletedCount).toBe(5);

    // Verify only 5 recent messages remain
    dbMessages = await repository.find();
    expect(dbMessages.length).toBe(5);

    // Verify remaining messages are the recent ones
    for (const msg of dbMessages) {
      const parsed = JSON.parse(msg.payload);
      expect(parsed.messageId).toBeGreaterThanOrEqual(6);
      expect(parsed.messageId).toBeLessThanOrEqual(10);
    }
  });

  /**
   * Test 11: Performance validation for large backfill with database
   *
   * Validates: NFR1 - Backfill performance at scale
   *
   * Scenario:
   * 1. Add 1500 messages to buffer and database
   * 2. Create new service instance (restart simulation)
   * 3. Verify restoration completes within reasonable time
   * 4. Verify backfill retrieval is fast
   */
  it('should handle 1500 message backfill with database persistence efficiently', async () => {
    const MESSAGE_COUNT = 1500;
    const baseTime = Date.now();

    // Add 1500 messages
    const addStartTime = Date.now();
    for (let i = 1; i <= MESSAGE_COUNT; i++) {
      const eventTimestamp = baseTime + i * 100; // 100ms apart
      const event = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        {
          id: i,
          text: `Message ${i}`,
          date: Math.floor((baseTime + i * 100) / 1000),
        },
        undefined,
        eventTimestamp,
      );
      backfillBuffer.add(event);
    }
    const addEndTime = Date.now();
    console.log(`Add ${MESSAGE_COUNT} messages: ${addEndTime - addStartTime}ms`);

    // Wait for database persistence
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify database has all messages
    const dbCount = await repository.count();
    expect(dbCount).toBe(MESSAGE_COUNT);

    // Simulate restart: create new buffer instance
    const restoreStartTime = Date.now();
    const newBuffer = new BackfillBufferService(repository);
    await newBuffer.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const restoreEndTime = Date.now();
    const restoreDuration = restoreEndTime - restoreStartTime;

    console.log(`Restore ${MESSAGE_COUNT} messages: ${restoreDuration}ms`);

    // Verify all messages restored
    expect(newBuffer.getSize()).toBe(MESSAGE_COUNT);

    // Measure backfill query performance
    const queryStartTime = Date.now();
    const messages = newBuffer.getEventsSince(baseTime);
    const queryEndTime = Date.now();
    const queryDuration = queryEndTime - queryStartTime;

    console.log(`Query ${MESSAGE_COUNT} messages: ${queryDuration}ms`);

    // Verify all messages retrieved
    expect(messages.length).toBe(MESSAGE_COUNT);

    // Performance assertions
    expect(restoreDuration).toBeLessThan(10000); // Restore should be < 10s
    expect(queryDuration).toBeLessThan(1000); // Query should be < 1s
  });
});
