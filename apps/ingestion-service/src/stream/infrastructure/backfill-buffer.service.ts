import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { BroadcastEvent } from '../domain/broadcast-event.vo';
import { BackfillMessageEntity } from './persistence/typeorm/backfill-message.entity';

/**
 * BackfillBufferService - Ring Buffer for Recent Message Storage
 *
 * Provides O(1) lookup for recent messages during backend reconnections.
 * Stores up to 5000 messages in a circular buffer (bounded memory: ~25MB @ 5KB/msg).
 * Persists messages to database for 72-hour retention and restart recovery.
 *
 * Requirements:
 * - 7.1: In-memory ring buffer with 5000 message capacity
 * - 7.2: Database persistence for restart recovery
 * - 7.3: getEventsSince() filters by timestamp
 * - 7.4: O(1) add operation with circular overwrite
 * - 7.5: 72-hour retention window via cleanup
 *
 * ADR-2: Ring Buffer + DB Hybrid
 * - In-memory ring buffer covers ~2h of traffic at peak (40 msg/min)
 * - Bounded memory footprint
 * - Fast lookup for recent reconnections
 * - DB persistence survives restarts
 */
@Injectable()
export class BackfillBufferService implements OnModuleInit {
  private readonly logger = new Logger(BackfillBufferService.name);
  private readonly ringBuffer: (BroadcastEvent | null)[] = [];
  private readonly MAX_SIZE = 5000;
  private readonly RETENTION_HOURS = 72;
  private head = 0;

  constructor(
    @InjectRepository(BackfillMessageEntity)
    private readonly backfillRepository: Repository<BackfillMessageEntity>,
  ) {}

  async onModuleInit() {
    this.logger.log(
      `BackfillBufferService initializing with capacity ${this.MAX_SIZE}`,
    );
    await this.restoreFromDatabase();
    this.logger.log(
      `BackfillBufferService initialized with ${this.getSize()} messages from database`,
    );
  }

  /**
   * Add event to ring buffer
   *
   * When buffer is at capacity, overwrites the oldest entry.
   * O(1) operation. Triggers async database persistence (fire-and-forget).
   *
   * Per Requirement 7.2: Messages persisted to database asynchronously
   * Per Requirement 7.4: O(1) add operation
   *
   * @param event - BroadcastEvent to store
   */
  add(event: BroadcastEvent): void {
    this.ringBuffer[this.head] = event;
    this.head = (this.head + 1) % this.MAX_SIZE;

    // Fire-and-forget persistence to database
    this.persistAsync(event).catch((error) => {
      this.logger.error(
        `Failed to persist event ${event.eventId}: ${error.message}`,
        error.stack,
      );
    });

    const size = this.getSize();
    if (size % 1000 === 0 && size > 0) {
      this.logger.debug(
        `Backfill buffer size: ${size}/${this.MAX_SIZE}, oldest: ${this.getOldestTimestamp()}`,
      );
    }
  }

  /**
   * Get all events since the given timestamp
   *
   * Scans the ring buffer and returns events with timestamp >= sinceTimestamp,
   * sorted by timestamp ascending.
   *
   * Returns empty array if:
   * - No events in buffer
   * - All events are older than sinceTimestamp
   *
   * @param sinceTimestamp - Unix timestamp in milliseconds
   * @returns Array of BroadcastEvents sorted by timestamp (oldest first)
   */
  getEventsSince(sinceTimestamp: number): BroadcastEvent[] {
    const events: BroadcastEvent[] = [];

    for (let i = 0; i < this.MAX_SIZE; i++) {
      const event = this.ringBuffer[i];
      if (event !== null && event !== undefined) {
        if (event.timestamp >= sinceTimestamp) {
          events.push(event);
        }
      }
    }

    // Sort by timestamp ascending (oldest first)
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get the current number of non-null entries in the buffer
   *
   * @returns Count of stored events (0 to MAX_SIZE)
   */
  getSize(): number {
    let count = 0;
    for (let i = 0; i < this.MAX_SIZE; i++) {
      if (this.ringBuffer[i] !== null && this.ringBuffer[i] !== undefined) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get the timestamp of the oldest event in the buffer
   *
   * @returns Unix timestamp in milliseconds, or null if buffer is empty
   */
  getOldestTimestamp(): number | null {
    let oldest: number | null = null;

    for (let i = 0; i < this.MAX_SIZE; i++) {
      const event = this.ringBuffer[i];
      if (event !== null && event !== undefined) {
        if (oldest === null || event.timestamp < oldest) {
          oldest = event.timestamp;
        }
      }
    }

    return oldest;
  }

  /**
   * Persist event to database asynchronously (fire-and-forget)
   *
   * Converts BroadcastEvent to BackfillMessageEntity and saves to database.
   * Errors are caught and logged but do not throw to avoid blocking add().
   *
   * Per Requirement 7.2: Messages persisted to database for restart recovery
   *
   * @param event - BroadcastEvent to persist
   * @private
   */
  private async persistAsync(event: BroadcastEvent): Promise<void> {
    try {
      const entity = new BackfillMessageEntity();
      entity.eventId = event.eventId;
      entity.timestamp = event.timestamp;
      entity.channelId = event.channelId;
      entity.messageId = event.messageId;
      entity.payload = JSON.stringify(event.toJSON());

      await this.backfillRepository.save(entity);
    } catch (error) {
      // Log error but don't throw - fire-and-forget
      this.logger.error(
        `Database persistence failed for event ${event.eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Restore buffer from database on startup
   *
   * Loads all messages from the last 72 hours, parses them back to BroadcastEvents,
   * and adds them to the ring buffer in chronological order (oldest first).
   *
   * Per Requirement 7.2: Buffer restored from database on startup
   * Per Requirement 7.1: 72-hour retention window
   *
   * @private
   */
  private async restoreFromDatabase(): Promise<void> {
    try {
      const retentionMs = this.RETENTION_HOURS * 60 * 60 * 1000;
      const cutoffTimestamp = Date.now() - retentionMs;

      this.logger.log(
        `Restoring backfill buffer from database (cutoff: ${new Date(cutoffTimestamp).toISOString()})`,
      );

      const entities = await this.backfillRepository.find({
        where: {
          timestamp: MoreThanOrEqual(cutoffTimestamp),
        },
        order: {
          timestamp: 'ASC', // Load oldest first to maintain chronological order
        },
      });

      let restoredCount = 0;
      let parseErrors = 0;

      for (const entity of entities) {
        try {
          const event = BroadcastEvent.fromJSON(entity.payload);
          // Add directly to ring buffer without triggering persistAsync
          this.ringBuffer[this.head] = event;
          this.head = (this.head + 1) % this.MAX_SIZE;
          restoredCount++;
        } catch (error) {
          parseErrors++;
          this.logger.warn(
            `Failed to parse event ${entity.eventId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Restored ${restoredCount} messages from database (${parseErrors} parse errors)`,
      );
    } catch (error) {
      // Log error but continue - service can operate with empty buffer
      this.logger.error(
        `Failed to restore buffer from database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clean up old messages from database
   *
   * Deletes all messages older than the 72-hour retention window.
   * Returns the count of deleted messages.
   *
   * Per Requirement 7.5: Cleanup of messages older than 72 hours
   *
   * @returns Promise<number> Count of deleted messages
   */
  async cleanupOldMessages(): Promise<number> {
    try {
      const retentionMs = this.RETENTION_HOURS * 60 * 60 * 1000;
      const cutoffTimestamp = Date.now() - retentionMs;

      this.logger.log(
        `Cleaning up backfill messages older than ${new Date(cutoffTimestamp).toISOString()}`,
      );

      const result = await this.backfillRepository.delete({
        timestamp: LessThan(cutoffTimestamp),
      });

      const deletedCount = result.affected || 0;
      this.logger.log(`Deleted ${deletedCount} old backfill messages`);

      return deletedCount;
    } catch (error) {
      this.logger.error(
        `Failed to cleanup old messages: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Scheduled cleanup cron job
   *
   * Runs daily at 3 AM to clean up messages older than 72 hours.
   * Catches and logs errors to prevent cron job failure.
   *
   * Per Requirement 7.2: Scheduled cleanup of old messages
   * Per Requirement 7.5: 72-hour retention enforcement
   *
   * Cron expression: '0 3 * * *' (3 AM daily)
   */
  @Cron('0 3 * * *')
  async scheduledCleanup(): Promise<void> {
    try {
      this.logger.log('Starting scheduled cleanup of old backfill messages');

      const deletedCount = await this.cleanupOldMessages();

      this.logger.log(
        `Scheduled cleanup completed: deleted ${deletedCount} messages`,
      );
    } catch (error) {
      // Catch and log errors to prevent cron job failure
      this.logger.error(
        `Scheduled cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Do not throw - cron should continue on next schedule
    }
  }
}
