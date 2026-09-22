import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import {
  TelegramListenerPort,
  TelegramRawMessage,
  ResolvedChannelMetadata,
  JoinChannelResult,
  // TelegramMediaAttachment, // Unused - MessagePayload uses different media structure
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
 * Registration result from ingestion-telegram
 */
export interface RegistrationResult {
  registered: boolean;
  channelUnionSize: number;
  message: string;
}

/**
 * Registration status for health checks
 */
export enum RegistrationStatus {
  UNREGISTERED = 'unregistered',
  REGISTERED = 'registered',
  RETRYING = 'retrying',
  FAILED = 'failed',
}

/**
 * TelegramSseListenerAdapter - SSE-based TelegramListenerPort implementation
 *
 * Per Requirement 3.1, 3.2, 3.3: Drop-in replacement for the removed direct Telegram listener (T5)
 * Per Requirement 2.4: Automatic reconnection with exponential backoff
 * Per Requirement 3.4: Implements same interface contract as the former direct adapter
 *
 * Connects to Ingestion Service SSE stream and transforms MessagePayload
 * back to TelegramRawMessage format expected by backend use cases.
 *
 * Item 8 (telegram-feed-unification): owns backend registration with
 * ingestion-telegram (the deleted `BackendRegistrationClient` lived here as
 * a dependency — register-on-boot + 5-min keep-alive + 401 re-register are
 * preserved inline so the enforced `backendId` gate on
 * `GET /api/ingestion/stream` keeps passing). The registration whitelist is
 * derived from `KolRepository.findActive()` (feed HTTP reads now, never the
 * dropped local `kols` table).
 *
 * Key differences from the former direct adapter:
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
  private readonly backendId: string;
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay: number;
  private readonly baseReconnectDelay: number;
  private registrationStatus = RegistrationStatus.UNREGISTERED;
  private lastRegistrationAttempt: Date | null = null;
  private consecutiveFailures = 0;
  private channelUnionSize = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly kolRepo: KolRepository,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const appConfig = this.config.get('app');
    this.ingestionServiceUrl =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appConfig?.ingestion?.serviceUrl || 'http://localhost:3031';
    this.backendId =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appConfig?.backendId || process.env.BACKEND_ID || 'production';

    // SSE reconnect backoff knobs (fail-soft to 1000/30000 when unconfigured,
    // mirroring app.cryptoNews.pollingIntervalMinutes validation).
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const sse = appConfig?.ingestion?.sse as
      | {
          reconnectInitialDelayMs?: unknown;
          reconnectMaxDelayMs?: unknown;
        }
      | undefined;
    const initial =
      typeof sse?.reconnectInitialDelayMs === 'number' &&
      Number.isFinite(sse.reconnectInitialDelayMs)
        ? sse.reconnectInitialDelayMs
        : 1_000;
    const max =
      typeof sse?.reconnectMaxDelayMs === 'number' &&
      Number.isFinite(sse.reconnectMaxDelayMs)
        ? sse.reconnectMaxDelayMs
        : 30_000;
    this.baseReconnectDelay = initial;
    this.maxReconnectDelay = Math.max(max, initial);

    this.logger.log(
      `Initialized SSE listener adapter (ingestion service: ${this.ingestionServiceUrl})`,
    );
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `[SSE-ADAPTER] Initializing with ID: ${this.backendId} (registration non-blocking)`,
    );

    // Registration happens async — never block boot (fail-open: the
    // subscribe loop retries with backoff until 200).
    void this.registerWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Subscribe to SSE stream for real-time messages
   *
   * Per Requirement 3.2: EventSource-based SSE connection
   * Per Requirement 2.4: Auto-reconnect with exponential backoff
   * UPDATED: Includes backendId query param for multi-backend support
   *
   * @param channelIds - Channels to filter (filtering done client-side)
   * @yields TelegramRawMessage for each message in subscribed channels
   */
  async *subscribe(channelIds: string[]): AsyncIterable<TelegramRawMessage> {
    const streamUrl = `${this.ingestionServiceUrl}/api/ingestion/stream?backendId=${this.backendId}`;

    this.logger.log(
      `Subscribing to SSE stream for ${channelIds.length} channels: ${streamUrl}`,
    );
    this.logger.debug(`SSE subscribe backendId: ${this.backendId}`);
    this.logger.debug(`SSE subscribe channels: ${channelIds.join(', ')}`);

    while (true) {
      try {
        // Reset reconnect counter on successful connection
        this.reconnectAttempts = 0;

        yield* this.connectAndStream(streamUrl, channelIds);
      } catch (error) {
        // Check if error is 401 Unauthorized
        if (error instanceof Error && error.message.includes('HTTP 401')) {
          this.logger.error(
            '[SSE-ADAPTER] Received 401 Unauthorized - forcing re-registration',
          );
          await this.registerWithRetry(1);

          // Wait a bit before retrying
          await this.sleep(5000);
          continue;
        }

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
   * @param url - SSE stream URL (includes backendId query param)
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
              `SSE received message from ${payload.peerId}:${payload.messageId}`,
            );

            // Filter by subscribed channels
            if (channelIds.includes(payload.peerId)) {
              this.logger.debug(
                `SSE message ${payload.peerId}:${payload.messageId} passed filter, about to yield...`,
              );
              const rawMessage = this.payloadToRawMessage(payload);
              this.logger.debug(
                `SSE message ${payload.peerId}:${payload.messageId} transformed to RawMessage, yielding now...`,
              );
              yield rawMessage;
              this.logger.debug(
                `SSE message ${payload.peerId}:${payload.messageId} yielded successfully`,
              );
            } else {
              this.logger.debug(
                `SSE message ${payload.peerId}:${payload.messageId} NOT in subscribed channels, skipping`,
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
   * Per Requirement 3.3: Same TelegramRawMessage format as before (T5)
   * Per Q1-B (adr-kol-raw-text.md): text passes through for BOTH types.
   * Backend-internal ToS boundary UNCHANGED: raw text never crosses the
   * backend event bus (fix-1) — see KolMessageIngestedEvent (no text field).
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
      messageType: payload.messageType, // Preserve messageType for coordinator routing
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

    // REDACTED (Q1-B, adr-kol-raw-text.md): log shape only — raw text NEVER hits disk logs.
    this.logger.debug(
      `SSE payload transform ${payload.peerId}:${payload.messageId} - payload.text length: ${payload.text?.length ?? 0} → rawMessage.text length: ${rawMessage.text.length}, messageType: ${rawMessage.messageType}`,
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
    // Skip backfill for users/bots — only channels support backfill
    // Channels always start with -100 prefix
    if (!channelId.startsWith('-100')) {
      this.logger.log(
        `Skipping backfill for ${channelId} (user/bot detected by ID format) — backfill only works for channels`,
      );
      return [];
    }

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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
   * Per Requirement 2.4: Exponential backoff, capped at the configured max.
   * Bounds come from `app.ingestion.sse` (`SSE_RECONNECT_INITIAL_DELAY_MS`,
   * default 1000; `SSE_RECONNECT_MAX_DELAY_MS`, default 30000).
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

  /**
   * Active KOL channel IDs for the registration whitelist.
   *
   * Item 8: derived from `KolRepository.findActive()` (feed HTTP reads via
   * `FeedIdentityHttpClient`) — never from the dropped local `kols` table.
   * Fail-open `[]` on feed outage (registration still succeeds; the union
   * is informational — the stream broadcasts everything and the backend
   * filters client-side).
   */
  private async getActiveChannels(): Promise<string[]> {
    try {
      const active = await this.kolRepo.findActive();
      return active.map((k) => k.kolId.value);
    } catch (error) {
      this.logger.warn(
        `Failed to query active KOL channels for registration (fail-open []): ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Register with ingestion-telegram (retry, exponential backoff).
   *
   * Preserved from the deleted `BackendRegistrationClient` (item 8): the
   * stream endpoint enforces the `backendId` gate (401 when unregistered),
   * so boot-time + keep-alive registration stays. Non-blocking callers use
   * `void`.
   */
  private async registerWithRetry(maxAttempts = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.registrationStatus = RegistrationStatus.RETRYING;
        this.lastRegistrationAttempt = new Date();

        const result = await this.registerWithIngestionService();

        if (result.registered) {
          this.registrationStatus = RegistrationStatus.REGISTERED;
          this.consecutiveFailures = 0;
          this.channelUnionSize = result.channelUnionSize;

          this.logger.log(
            `[SSE-REGISTRATION-SUCCESS] Registered as "${this.backendId}" with ${result.channelUnionSize} channels in union`,
          );
          return;
        }
      } catch (error) {
        this.consecutiveFailures++;
        const isLastAttempt = attempt === maxAttempts;

        if (isLastAttempt) {
          this.registrationStatus = RegistrationStatus.FAILED;
          this.logger.error(
            `[SSE-REGISTRATION-FAILED] Failed after ${maxAttempts} attempts: ${(error as Error).message}`,
          );
          return;
        }

        const delay = Math.min(Math.pow(2, attempt - 1) * 1000, 30_000);
        this.logger.warn(
          `[SSE-REGISTRATION-RETRY] Attempt ${attempt} failed, retrying in ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }
  }

  /**
   * Single registration POST against ingestion-telegram.
   */
  private async registerWithIngestionService(): Promise<RegistrationResult> {
    const sourceWhitelist = await this.getActiveChannels();
    const url = `${this.ingestionServiceUrl}/api/ingestion/backends/register`;

    const payload = {
      backendId: this.backendId,
      sourceWhitelist,
      apiVersion: 'v1',
    };

    this.logger.log(
      `[SSE-REGISTRATION-REQUEST] POST ${url} with ${sourceWhitelist.length} channels`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Registration failed with status ${response.status}: ${errorText}`,
        );
      }

      const result = (await response.json()) as RegistrationResult;
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Registration request timed out after 10s');
      }

      throw error;
    }
  }

  /**
   * Keep-alive: re-register every 5 minutes.
   *
   * Preserved from the deleted `BackendRegistrationClient` (item 8): the
   * ingestion registry is in-memory, so an ingestion restart wipes our
   * registration — without this cron the stream would 401 forever.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleKeepAlive(): Promise<void> {
    if (this.registrationStatus === RegistrationStatus.UNREGISTERED) {
      return;
    }

    this.logger.log(
      '[SSE-REGISTRATION-KEEPALIVE] Running keep-alive registration',
    );

    try {
      const result = await this.registerWithIngestionService();

      if (result.registered) {
        this.registrationStatus = RegistrationStatus.REGISTERED;
        this.consecutiveFailures = 0;
        this.channelUnionSize = result.channelUnionSize;
        this.logger.log(
          `[SSE-REGISTRATION-KEEPALIVE-SUCCESS] Channel union size: ${result.channelUnionSize}`,
        );
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.logger.warn(
        `[SSE-REGISTRATION-KEEPALIVE-FAILED] ${(error as Error).message}`,
      );

      if (this.consecutiveFailures >= 3) {
        this.logger.error(
          '[SSE-REGISTRATION-KEEPALIVE-FAILED] Too many keep-alive failures, triggering full re-registration',
        );
        this.registrationStatus = RegistrationStatus.UNREGISTERED;
        void this.registerWithRetry();
      }
    }
  }

  /**
   * Registration status for health checks.
   */
  getStatus(): {
    status: RegistrationStatus;
    backendId: string;
    channelUnionSize: number;
    lastAttempt: Date | null;
    consecutiveFailures: number;
  } {
    return {
      status: this.registrationStatus,
      backendId: this.backendId,
      channelUnionSize: this.channelUnionSize,
      lastAttempt: this.lastRegistrationAttempt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Backend ID used in the stream `backendId` query param.
   */
  getBackendId(): string {
    return this.backendId;
  }
}
