import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TelegramListenerPort,
  TelegramRawMessage,
  ResolvedChannelMetadata,
  JoinChannelResult,
  TelegramMediaAttachment,
} from '../../domain/ports/telegram-listener.port';

/**
 * MessagePayload from Ingestion Service SSE stream
 *
 * Per Invariant 1 (modified): text excluded for KOL (extraction handles it), included for crypto-news (opaque content)
 * Backend must fetch full text via backfill for KOL messages; crypto-news includes text directly
 */
interface MessagePayload {
  peerId: string;
  messageId: number;
  occurredAt: string;
  text?: string; // Present for crypto-news, omitted for KOL
  media: Array<{
    type: 'photo' | 'video';
    index: number;
    url: string;
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
  messageType: 'kol' | 'crypto-news';
}

/**
 * TelegramSseListenerAdapter - SSE-based TelegramListenerPort implementation
 *
 * Per Requirement 3.1, 3.2, 3.3: Drop-in replacement for TelegramMtprotoListenerAdapter
 * Per Requirement 2.4: Automatic reconnection with exponential backoff
 * Per Requirement 3.4: Implements same interface contract as MTProto adapter
 *
 * Connects to Ingestion Service SSE stream and transforms MessagePayload
 * back to TelegramRawMessage format expected by backend use cases.
 *
 * Key differences from MTProto adapter:
 * - No direct Telegram API access
 * - Text field empty (must fetch via backfill if needed)
 * - Media URLs instead of local file paths
 * - No session management (stateless HTTP client)
 *
 * @implements TelegramListenerPort
 */
@Injectable()
export class TelegramSseListenerAdapter
  implements TelegramListenerPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramSseListenerAdapter.name);
  private readonly ingestionServiceUrl: string;
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30_000; // 30s
  private readonly baseReconnectDelay = 1_000; // 1s

  constructor(private readonly config: ConfigService) {
    const appConfig = this.config.get('app');
    this.ingestionServiceUrl =
      appConfig?.ingestion?.serviceUrl || 'http://localhost:3031';

    this.logger.log(
      `Initialized SSE listener adapter (ingestion service: ${this.ingestionServiceUrl})`,
    );
  }

  async onModuleInit(): Promise<void> {
    console.log(
      '[LIFECYCLE-DEBUG] TelegramSseListenerAdapter.onModuleInit() START',
    );
    this.logger.log('TelegramSseListenerAdapter module initialized');
    console.log(
      '[LIFECYCLE-DEBUG] TelegramSseListenerAdapter.onModuleInit() END',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Subscribe to SSE stream for real-time messages
   *
   * Per Requirement 3.2: EventSource-based SSE connection
   * Per Requirement 2.4: Auto-reconnect with exponential backoff
   *
   * @param channelIds - Channels to filter (filtering done client-side)
   * @yields TelegramRawMessage for each message in subscribed channels
   */
  async *subscribe(channelIds: string[]): AsyncIterable<TelegramRawMessage> {
    const streamUrl = `${this.ingestionServiceUrl}/api/ingestion/stream`;

    this.logger.log(
      `Subscribing to SSE stream for ${channelIds.length} channels: ${streamUrl}`,
    );
    this.logger.log(`[SSE-DEBUG] ChannelIds: ${channelIds.join(', ')}`);

    while (true) {
      try {
        // Reset reconnect counter on successful connection
        this.reconnectAttempts = 0;

        yield* this.connectAndStream(streamUrl, channelIds);
      } catch (error) {
        // Calculate exponential backoff delay
        const delay = this.calculateBackoff();

        this.logger.warn(
          `SSE connection failed (attempt ${this.reconnectAttempts}), reconnecting in ${delay}ms`,
          error instanceof Error ? error.message : String(error),
        );

        await this.sleep(delay);
      }
    }
  }

  /**
   * Connect to SSE stream and yield messages
   *
   * Uses fetch API with ReadableStream for EventSource parsing
   *
   * @param url - SSE stream URL
   * @param channelIds - Channels to filter
   * @yields TelegramRawMessage
   */
  private async *connectAndStream(
    url: string,
    channelIds: string[],
  ): AsyncIterable<TelegramRawMessage> {
    this.abortController = new AbortController();

    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    this.logger.log('SSE connection established');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.logger.log('SSE stream closed by server');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete message in buffer

        for (const chunk of lines) {
          if (!chunk.trim()) continue;

          const message = this.parseSSE(chunk);

          if (message?.event === 'message:telegram') {
            const payload = message.data as MessagePayload;

            this.logger.debug(
              `[SSE-DEBUG] Received message from ${payload.peerId}:${payload.messageId}`,
            );

            // Filter by subscribed channels
            if (channelIds.includes(payload.peerId)) {
              this.logger.log(
                `[SSE-DEBUG] Message ${payload.peerId}:${payload.messageId} passed filter, about to yield...`,
              );
              const rawMessage = this.payloadToRawMessage(payload);
              this.logger.log(
                `[SSE-DEBUG] Message ${payload.peerId}:${payload.messageId} transformed to RawMessage, yielding now...`,
              );
              yield rawMessage;
              this.logger.log(
                `[SSE-DEBUG] Message ${payload.peerId}:${payload.messageId} yielded successfully`,
              );
            } else {
              this.logger.debug(
                `[SSE-DEBUG] Message ${payload.peerId}:${payload.messageId} NOT in subscribed channels, skipping`,
              );
            }
          } else if (message?.event === 'health:ping') {
            // Heartbeat received - connection is alive
            this.logger.debug('SSE heartbeat received');
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse SSE event format
   *
   * Format: event: <type>\ndata: <json>\n\n
   *
   * @param chunk - Raw SSE chunk
   * @returns Parsed event or null
   */
  private parseSSE(chunk: string): { event: string; data: any } | null {
    const lines = chunk.split('\n');
    let event = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.substring(7).trim();
      } else if (line.startsWith('data: ')) {
        data = line.substring(6).trim();
      }
    }

    if (!event || !data) return null;

    try {
      return {
        event,
        data: JSON.parse(data),
      };
    } catch (error) {
      this.logger.error(
        `Failed to parse SSE data: ${data}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Transform MessagePayload to TelegramRawMessage
   *
   * Per Requirement 3.3: Same format as MTProto adapter
   * Per Invariant 1: text field empty (ToS compliance)
   *
   * @param payload - SSE payload from Ingestion Service
   * @returns TelegramRawMessage compatible with backend use cases
   */
  private payloadToRawMessage(payload: MessagePayload): TelegramRawMessage {
    const rawMessage = {
      peerId: payload.peerId,
      messageId: payload.messageId,
      text: payload.text ?? '', // Use text from payload if present (crypto-news), empty for KOL (extraction handles it)
      occurredAt: new Date(payload.occurredAt),
      media: payload.media.map((m) => ({
        type: m.type,
        fileId: '', // Not available in SSE payload
        accessHash: '', // Not available in SSE payload
        fileReference: '', // Not available in SSE payload
        mimeType: m.mimeType,
        filePath: m.url, // URL instead of local path
        fileSize: m.fileSize,
        index: m.index,
      })),
      entities: payload.entities,
      groupedId: payload.groupedId ? BigInt(payload.groupedId) : undefined,
    };

    // DEBUG: Log text transformation
    this.logger.log(
      `[PAYLOAD-TRANSFORM-DEBUG] ${payload.peerId}:${payload.messageId} - payload.text: "${payload.text}" (type: ${typeof payload.text}, length: ${payload.text?.length ?? 0}) → rawMessage.text: "${rawMessage.text}" (length: ${rawMessage.text.length})`,
    );

    return rawMessage;
  }

  /**
   * Backfill historical messages via SSE streaming
   *
   * Per GAP 1: Backfill endpoint with SSE
   * Per Requirement 3.2: SSE-based delivery
   *
   * @param channelId - Channel to backfill
   * @param limit - Number of recent messages (max 100)
   * @returns Array of historical messages
   */
  async backfill(
    channelId: string,
    limit: number,
  ): Promise<TelegramRawMessage[]> {
    const backfillUrl = `${this.ingestionServiceUrl}/api/ingestion/backfill/${channelId}?limit=${Math.min(limit, 100)}`;

    this.logger.log(`Backfilling ${limit} messages from ${channelId}`);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 60_000); // 60s timeout

    try {
      const response = await fetch(backfillUrl, {
        headers: { Accept: 'text/event-stream' },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Backfill request failed: HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Backfill response has no body');
      }

      const messages: TelegramRawMessage[] = [];
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const chunk of lines) {
          if (!chunk.trim()) continue;

          const message = this.parseSSE(chunk);

          if (message?.event === 'backfill:message') {
            const payload = message.data as MessagePayload;
            messages.push(this.payloadToRawMessage(payload));
          } else if (message?.event === 'backfill:complete') {
            this.logger.log(
              `Backfill complete: ${messages.length} messages retrieved`,
            );
            reader.releaseLock();
            return messages;
          } else if (message?.event === 'backfill:error') {
            throw new Error(
              `Backfill error: ${message.data.error || 'Unknown error'}`,
            );
          }
        }
      }

      return messages;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Disconnect from SSE stream
   *
   * Aborts active fetch request
   */
  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.logger.log('SSE connection disconnected');
    }
  }

  /**
   * Resolve channel metadata
   *
   * NOT IMPLEMENTED - Ingestion Service doesn't expose this yet
   * Returns placeholder data
   */
  async resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    this.logger.warn(
      `resolveChannelMetadata not implemented for SSE adapter (channelId: ${channelId})`,
    );

    return {
      peerId: channelId,
      title: `Channel ${channelId}`,
      handle: null,
      kind: 'unknown',
    };
  }

  /**
   * Join channel
   *
   * NOT IMPLEMENTED - Ingestion Service handles channel management
   * Returns placeholder result
   */
  async joinChannel(peerId: string): Promise<JoinChannelResult> {
    this.logger.warn(
      `joinChannel not implemented for SSE adapter (peerId: ${peerId})`,
    );

    return {
      joined: false,
      wasAlreadyMember: false,
      error: 'SSE adapter does not support joinChannel - use Ingestion Service',
    };
  }

  /**
   * Calculate exponential backoff delay
   *
   * Per Requirement 2.4: Exponential backoff with 30s cap
   *
   * @returns Delay in milliseconds
   */
  private calculateBackoff(): number {
    this.reconnectAttempts++;
    const exponential =
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    return Math.min(exponential, this.maxReconnectDelay);
  }

  /**
   * Sleep utility
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
