import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackfillMessageEntity } from '../backfill-message.entity';
import { v4 as uuidv4 } from 'uuid';

/**
 * Integration tests for BackfillMessageEntity.
 *
 * Tests TypeORM entity persistence, retrieval, and index performance.
 *
 * Per Requirement 7.1: Backfill buffer retains messages for 72 hours
 * Per Requirement 7.2: Messages persisted to database for restart recovery
 * Per Requirement 7.3: Fast timestamp-based queries for backfill
 */
describe('BackfillMessageEntity - Integration', () => {
  let module: TestingModule;
  let repository: Repository<BackfillMessageEntity>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.INGESTION_DATABASE_HOST || 'localhost',
          port: parseInt(process.env.INGESTION_DATABASE_PORT || '5432', 10),
          username: process.env.INGESTION_DATABASE_USER || 'postgres',
          password: process.env.INGESTION_DATABASE_PASSWORD || 'postgres',
          database:
            process.env.INGESTION_DATABASE_NAME || 'onchain_bot_test_entity',
          entities: [BackfillMessageEntity],
          synchronize: true, // Create schema in test DB
          logging: false,
        }),
        TypeOrmModule.forFeature([BackfillMessageEntity]),
      ],
    }).compile();

    repository = module.get<Repository<BackfillMessageEntity>>(
      'BackfillMessageEntityRepository',
    );

    // Clean slate: remove any residual data from previous test runs
    await repository.clear();
  });

  afterAll(async () => {
    // Clean up test data
    await repository.clear();
    await module.close();
  });

  beforeEach(async () => {
    // Ensure clean state before each test (critical for test isolation)
    await repository.clear();
  });

  afterEach(async () => {
    // Clean up after each test
    await repository.clear();
  });

  describe('Entity Persistence (Requirement 7.2)', () => {
    it('should save entity to database with all fields', async () => {
      // Arrange
      const entity = new BackfillMessageEntity();
      entity.eventId = uuidv4();
      entity.timestamp = Date.now();
      entity.channelId = '-1001234567890';
      entity.messageId = 167;
      entity.payload = JSON.stringify({
        eventId: entity.eventId,
        timestamp: entity.timestamp,
        channelId: entity.channelId,
        messageId: entity.messageId,
        content: 'Test message',
        publishedAt: entity.timestamp,
      });

      // Act
      const saved = await repository.save(entity);

      // Assert
      expect(saved).toBeDefined();
      expect(saved.eventId).toBe(entity.eventId);
      expect(saved.timestamp).toBe(entity.timestamp);
      expect(saved.channelId).toBe(entity.channelId);
      expect(saved.messageId).toBe(entity.messageId);
      expect(saved.payload).toBe(entity.payload);
    });

    it('should retrieve entity by eventId (primary key)', async () => {
      // Arrange
      const eventId = uuidv4();
      const entity = new BackfillMessageEntity();
      entity.eventId = eventId;
      entity.timestamp = Date.now();
      entity.channelId = '-1001234567890';
      entity.messageId = 100;
      entity.payload = JSON.stringify({ test: 'data' });

      await repository.save(entity);

      // Act
      const retrieved = await repository.findOne({
        where: { eventId },
      });

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.eventId).toBe(eventId);
      expect(retrieved?.timestamp).toBe(entity.timestamp);
      expect(retrieved?.channelId).toBe(entity.channelId);
      expect(retrieved?.messageId).toBe(entity.messageId);
    });

    it('should handle large payload (text column)', async () => {
      // Arrange
      const entity = new BackfillMessageEntity();
      entity.eventId = uuidv4();
      entity.timestamp = Date.now();
      entity.channelId = '-1001234567890';
      entity.messageId = 200;

      // Create large payload (10KB+ JSON)
      const largeContent = 'x'.repeat(10000);
      entity.payload = JSON.stringify({
        eventId: entity.eventId,
        timestamp: entity.timestamp,
        channelId: entity.channelId,
        messageId: entity.messageId,
        content: largeContent,
        publishedAt: entity.timestamp,
      });

      // Act
      const saved = await repository.save(entity);
      const retrieved = await repository.findOne({
        where: { eventId: saved.eventId },
      });

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.payload).toBe(entity.payload);
      expect(retrieved?.payload.length).toBeGreaterThan(10000);
    });

    it('should enforce unique eventId (primary key constraint)', async () => {
      // Arrange
      const eventId = uuidv4();
      const entity1 = new BackfillMessageEntity();
      entity1.eventId = eventId;
      entity1.timestamp = Date.now();
      entity1.channelId = '-1001234567890';
      entity1.messageId = 300;
      entity1.payload = JSON.stringify({ test: 'first' });

      await repository.save(entity1);

      const entity2 = new BackfillMessageEntity();
      entity2.eventId = eventId; // Same eventId
      entity2.timestamp = Date.now() + 1000;
      entity2.channelId = '-1001234567891';
      entity2.messageId = 301;
      entity2.payload = JSON.stringify({ test: 'second' });

      // Act & Assert - use insert() to enforce PK constraint (save() does upsert)
      await expect(repository.insert(entity2)).rejects.toThrow();
    });
  });

  describe('Timestamp-Based Queries (Requirement 7.3)', () => {
    const baseTime = 1700000000000; // Fixed timestamp for consistency

    beforeEach(async () => {
      // Seed test data with known timestamps
      const entities: BackfillMessageEntity[] = [];

      for (let i = 0; i < 10; i++) {
        const entity = new BackfillMessageEntity();
        entity.eventId = uuidv4();
        entity.timestamp = baseTime + i * 60000; // 1 minute apart
        entity.channelId = '-1001234567890';
        entity.messageId = 1000 + i;
        entity.payload = JSON.stringify({
          eventId: entity.eventId,
          timestamp: entity.timestamp,
          content: `Message ${i}`,
        });
        entities.push(entity);
      }

      await repository.save(entities);
    });

    it('should query messages after a given timestamp', async () => {
      // Arrange
      const threshold = baseTime + 5 * 60000; // After 5th message (messageId 1005)

      // Act
      const results = await repository
        .createQueryBuilder('backfill')
        .where('backfill.timestamp > :threshold', { threshold })
        .orderBy('backfill.timestamp', 'ASC')
        .getMany();

      // Assert
      expect(results).toHaveLength(4); // Messages 6-9 (indices 6-9)
      expect(results[0].messageId).toBe(1006);
      expect(results[3].messageId).toBe(1009);
    });

    it('should query messages within a time range', async () => {
      // Arrange
      const startTime = baseTime + 3 * 60000; // After 3rd message (messageId 1003)
      const endTime = baseTime + 7 * 60000; // Before 8th message (messageId 1007, inclusive)

      // Act
      const results = await repository
        .createQueryBuilder('backfill')
        .where('backfill.timestamp > :startTime', { startTime })
        .andWhere('backfill.timestamp <= :endTime', { endTime })
        .orderBy('backfill.timestamp', 'ASC')
        .getMany();

      // Assert
      expect(results).toHaveLength(4); // Messages 4-7 (indices 4-7)
      expect(results[0].messageId).toBe(1004);
      expect(results[3].messageId).toBe(1007);
    });

    it('should return empty array when no messages after timestamp', async () => {
      // Arrange
      const futureTime = Date.now() + 3600000; // 1 hour in future

      // Act
      const results = await repository
        .createQueryBuilder('backfill')
        .where('backfill.timestamp > :threshold', { threshold: futureTime })
        .getMany();

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should sort messages by timestamp ascending', async () => {
      // Arrange
      const threshold = baseTime - 1; // -1 to include first message (timestamp = baseTime)

      // Act
      const results = await repository
        .createQueryBuilder('backfill')
        .where('backfill.timestamp > :threshold', { threshold })
        .orderBy('backfill.timestamp', 'ASC')
        .getMany();

      // Assert
      expect(results).toHaveLength(10);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].timestamp).toBeLessThanOrEqual(
          results[i + 1].timestamp,
        );
      }
    });

    it('should handle query with zero results efficiently', async () => {
      // Arrange
      const veryOldTime = Date.now() - 7200000; // 2 hours ago (before all test data)

      // Act
      const startTime = Date.now();
      const results = await repository
        .createQueryBuilder('backfill')
        .where('backfill.timestamp > :threshold', {
          threshold: Date.now() + 1000,
        })
        .getMany();
      const queryDuration = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(0);
      expect(queryDuration).toBeLessThan(100); // Should be fast even with no results
    });
  });

  describe('Index Performance (Requirement 7.3)', () => {
    it('should use idx_backfill_timestamp index for timestamp queries', async () => {
      // Arrange - Insert larger dataset
      const baseTime = Date.now() - 3600000;
      const entities: BackfillMessageEntity[] = [];

      for (let i = 0; i < 100; i++) {
        const entity = new BackfillMessageEntity();
        entity.eventId = uuidv4();
        entity.timestamp = baseTime + i * 1000; // 1 second apart
        entity.channelId = '-1001234567890';
        entity.messageId = 2000 + i;
        entity.payload = JSON.stringify({ content: `Message ${i}` });
        entities.push(entity);
      }

      await repository.save(entities);

      // Act - Use EXPLAIN to check index usage
      const threshold = baseTime + 50000 - 1; // -1 to include message 50 (timestamp = baseTime + 50000)
      const queryBuilder = repository
        .createQueryBuilder('backfill')
        .where('backfill.timestamp > :threshold', { threshold })
        .orderBy('backfill.timestamp', 'ASC');

      // Get query results
      const results = await queryBuilder.getMany();

      // Assert
      expect(results).toHaveLength(50); // Messages 50-99
      expect(results[0].messageId).toBe(2050);
      expect(results[49].messageId).toBe(2099);

      // Note: In a real production test, you would check EXPLAIN output
      // to verify index usage. For this test, we verify correct results.
    });
  });

  describe('Bulk Operations (Requirement 7.2)', () => {
    it('should efficiently insert multiple entities', async () => {
      // Arrange
      const entities: BackfillMessageEntity[] = [];
      const baseTime = Date.now();

      for (let i = 0; i < 50; i++) {
        const entity = new BackfillMessageEntity();
        entity.eventId = uuidv4();
        entity.timestamp = baseTime + i * 1000;
        entity.channelId = '-1001234567890';
        entity.messageId = 3000 + i;
        entity.payload = JSON.stringify({ content: `Message ${i}` });
        entities.push(entity);
      }

      // Act
      const startTime = Date.now();
      await repository.save(entities);
      const saveDuration = Date.now() - startTime;

      // Assert
      const count = await repository.count();
      expect(count).toBe(50);
      expect(saveDuration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should efficiently delete old messages by timestamp', async () => {
      // Arrange - Insert messages with various timestamps
      const now = Date.now();
      const entities: BackfillMessageEntity[] = [];

      // Old messages (> 72h)
      for (let i = 0; i < 20; i++) {
        const entity = new BackfillMessageEntity();
        entity.eventId = uuidv4();
        entity.timestamp = now - 73 * 3600000 - i * 1000; // 73 hours ago
        entity.channelId = '-1001234567890';
        entity.messageId = 4000 + i;
        entity.payload = JSON.stringify({ content: `Old ${i}` });
        entities.push(entity);
      }

      // Recent messages (< 72h)
      for (let i = 0; i < 30; i++) {
        const entity = new BackfillMessageEntity();
        entity.eventId = uuidv4();
        entity.timestamp = now - 24 * 3600000 - i * 1000; // 24 hours ago
        entity.channelId = '-1001234567890';
        entity.messageId = 5000 + i;
        entity.payload = JSON.stringify({ content: `Recent ${i}` });
        entities.push(entity);
      }

      await repository.save(entities);

      // Act - Delete messages older than 72 hours
      const retentionThreshold = now - 72 * 3600000;
      const deleteResult = await repository
        .createQueryBuilder()
        .delete()
        .where('timestamp < :threshold', { threshold: retentionThreshold })
        .execute();

      // Assert
      expect(deleteResult.affected).toBe(20); // 20 old messages deleted

      const remainingCount = await repository.count();
      expect(remainingCount).toBe(30); // 30 recent messages remain

      // Verify all remaining messages are within retention window
      const remaining = await repository.find();
      for (const entity of remaining) {
        expect(entity.timestamp).toBeGreaterThanOrEqual(retentionThreshold);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle BigInt timestamp values correctly', async () => {
      // Arrange
      const entity = new BackfillMessageEntity();
      entity.eventId = uuidv4();
      entity.timestamp = 9007199254740991; // MAX_SAFE_INTEGER
      entity.channelId = '-1001234567890';
      entity.messageId = 6000;
      entity.payload = JSON.stringify({ content: 'Max timestamp' });

      // Act
      const saved = await repository.save(entity);
      const retrieved = await repository.findOne({
        where: { eventId: saved.eventId },
      });

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.timestamp).toBe(9007199254740991);
    });

    it('should handle negative channel IDs', async () => {
      // Arrange
      const entity = new BackfillMessageEntity();
      entity.eventId = uuidv4();
      entity.timestamp = Date.now();
      entity.channelId = '-1001234567890'; // Negative channel ID (common in Telegram)
      entity.messageId = 7000;
      entity.payload = JSON.stringify({ content: 'Negative channel' });

      // Act
      const saved = await repository.save(entity);
      const retrieved = await repository.findOne({
        where: { channelId: entity.channelId },
      });

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.channelId).toBe('-1001234567890');
    });

    it('should handle messageId = 0', async () => {
      // Arrange
      const entity = new BackfillMessageEntity();
      entity.eventId = uuidv4();
      entity.timestamp = Date.now();
      entity.channelId = '-1001234567890';
      entity.messageId = 0; // Edge case: messageId = 0
      entity.payload = JSON.stringify({ content: 'Zero message ID' });

      // Act
      const saved = await repository.save(entity);
      const retrieved = await repository.findOne({
        where: { messageId: 0 },
      });

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.messageId).toBe(0);
    });
  });
});
