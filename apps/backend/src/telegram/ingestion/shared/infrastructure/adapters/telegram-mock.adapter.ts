import { Injectable, Logger } from '@nestjs/common';
import {
  TelegramListenerPort,
  TelegramRawMessage,
  ResolvedChannelMetadata,
  JoinChannelResult,
} from '../../domain/ports/telegram-listener.port';

/**
 * Mock adapter for TelegramListenerPort
 * Used in dev:mock mode to test without connecting to Telegram or droplet
 */
@Injectable()
export class TelegramMockAdapter implements TelegramListenerPort {
  private readonly logger = new Logger(TelegramMockAdapter.name);
  private messageQueue: TelegramRawMessage[] = [];

  constructor() {
    this.logger.warn(
      '🧪 Mock ingestion adapter initialized (no Telegram connection)',
    );
  }

  /**
   * Subscribe returns an async generator that yields queued messages
   * Messages can be injected via CLI tools
   */
  async *subscribe(channelIds: string[]): AsyncGenerator<TelegramRawMessage> {
    this.logger.log(`Mock adapter subscribed to ${channelIds.length} channels`);
    this.logger.warn('💡 Use CLI tools to inject messages: npm run cli:inject');

    // Keep generator alive, yielding messages as they are queued
    while (true) {
      if (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;

        // Filter by subscribed channels
        if (channelIds.includes(message.peerId)) {
          this.logger.log(
            `📨 Yielding mock message: ${message.peerId}/${message.messageId}`,
          );
          yield message;
        }
      } else {
        // Wait 100ms before checking queue again
        await this.sleep(100);
      }
    }
  }

  /**
   * Inject a message into the queue
   * Called by CLI tools or dev controllers
   */
  injectMessage(message: TelegramRawMessage): void {
    this.logger.log(
      `📥 Injecting message: ${message.peerId}/${message.messageId}`,
    );
    this.messageQueue.push(message);
  }

  /**
   * Inject multiple messages (e.g., from fixture)
   */
  injectMessages(messages: TelegramRawMessage[]): void {
    this.logger.log(`📥 Injecting ${messages.length} messages`);
    this.messageQueue.push(...messages);
  }

  /**
   * Get current queue size (for debugging)
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.logger.log('🗑️  Clearing message queue');
    this.messageQueue = [];
  }

  async backfill(
    channelId: string,
    limit: number,
  ): Promise<TelegramRawMessage[]> {
    this.logger.warn('backfill() not supported in mock mode');
    return [];
  }

  async disconnect(): Promise<void> {
    this.logger.log('Mock adapter disconnected');
    this.clearQueue();
  }

  async resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    return {
      peerId: channelId,
      title: `Mock Channel ${channelId}`,
      handle: null,
      kind: 'channel',
    };
  }

  async joinChannel(peerId: string): Promise<JoinChannelResult> {
    this.logger.warn(`joinChannel() not supported in mock mode (${peerId})`);
    return {
      joined: true,
      wasAlreadyMember: false,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
