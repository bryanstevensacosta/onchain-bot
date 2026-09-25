import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CryptoNewsIngestedMessage,
  CryptoNewsIngestionClientPort,
} from '../../domain/ports/ingestion-client.port';
import { ProcessCryptoNewsMessageHandler } from '../handlers/process-crypto-news-message.handler';
import { isCryptoNewsFrame } from '../../infrastructure/http/dto/raw-crypto-news-message.dto';
import { DEFAULT_INGESTION_BASE_URL } from '../../infrastructure/http/ingestion-http-client.adapter';

const STREAM_PATH = '/api/ingestion/stream';
const CATCH_UP_LIMIT = 50;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Crypto-news ingestion client: realtime SSE with reconnect catch-up by cursor.
 *
 * Subscribes to `GET {baseUrl}/api/ingestion/stream` and accepts only
 * frames whose `data` carries the crypto-news marker (the top-level frame
 * kind is `message:telegram` for every telegram frame, so filtering MUST
 * be client-side on `data.messageType`). P10: the foreign feed type is
 * never accepted here (pinned by negative assert). SSE-only by design:
 * there is NO periodic polling loop. Gaps while the stream is down are
 * closed by an explicit catch-up read
 * (`GET /api/feed/messages?type=crypto-news`, filtered client-side to
 * rows newer than the per-channel cursor) on boot and after every
 * disconnect. Disconnects back off from 1s doubling to a 30s cap.
 * Sends `x-api-key` (`INGESTION_TELEGRAM_API_KEY`) from day one (P30).
 */
@Injectable()
export class CryptoNewsIngestionClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CryptoNewsIngestionClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly cursors = new Map<string, number>();
  private abortController: AbortController | null = null;
  private sseLoop: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly config: ConfigService,
    private readonly port: CryptoNewsIngestionClientPort,
    private readonly handler: ProcessCryptoNewsMessageHandler = new ProcessCryptoNewsMessageHandler(),
  ) {
    const fromConfig = config?.get<string>('INGESTION_TELEGRAM_URL');
    const raw =
      (typeof fromConfig === 'string' && fromConfig.trim().length > 0
        ? fromConfig
        : process.env['INGESTION_TELEGRAM_URL']
      )?.trim() || DEFAULT_INGESTION_BASE_URL;
    this.baseUrl = raw.replace(/\/+$/, '');
    const keyFromConfig = config?.get<string>('INGESTION_TELEGRAM_API_KEY');
    this.apiKey =
      (typeof keyFromConfig === 'string' && keyFromConfig.trim().length > 0
        ? keyFromConfig
        : process.env['INGESTION_TELEGRAM_API_KEY']
      )?.trim() || '';
  }

  async onModuleInit(): Promise<void> {
    this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stop();
  }

  start(): void {
    if (!this.stopped && this.sseLoop) {
      return;
    }
    this.stopped = false;
    void this.catchUpAfterReconnect().catch((error) => {
      this.logger.warn(
        `Boot catch-up failed (${error instanceof Error ? error.message : String(error)})`,
      );
    });
    this.sseLoop = this.runSseLoop();
  }

  stop(): void {
    this.stopped = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  buildBackoffDelay(attempt: number): number {
    const step = Math.max(1, Math.floor(attempt));
    return Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, step - 1),
      MAX_RECONNECT_DELAY_MS,
    );
  }

  /**
   * Highest messageId accepted for a channel (0 when nothing seen yet).
   */
  getLastSeenMessageId(channelId: string): number {
    return this.cursors.get(channelId) ?? 0;
  }

  /**
   * Accepts one realtime SSE frame. Returns true when a new crypto-news
   * row was recorded; malformed or non-crypto-news frames are ignored
   * (no throw).
   */
  acceptRealtimeFrame(frame: unknown): boolean {
    if (!isCryptoNewsFrame(frame)) {
      return false;
    }
    try {
      const accepted = this.handler.handle(frame);
      if (accepted) {
        this.advanceCursor(frame);
      }
      return accepted;
    } catch (error) {
      this.logger.warn(
        `Realtime frame ignored (${error instanceof Error ? error.message : String(error)})`,
      );
      return false;
    }
  }

  /**
   * Reconnect catch-up by cursor: fetch recent crypto-news rows and feed
   * only rows newer than the per-channel cursor through the handler.
   * Best-effort: never throws (warns and returns 0 on feed errors).
   * NOT periodic — call on boot and after an SSE disconnect.
   */
  async catchUpAfterReconnect(limit = CATCH_UP_LIMIT): Promise<number> {
    let rows: CryptoNewsIngestedMessage[];
    try {
      rows = await this.port.fetchRecentCryptoNewsMessages(limit);
    } catch (error) {
      this.logger.warn(
        `Catch-up read failed (${error instanceof Error ? error.message : String(error)})`,
      );
      return 0;
    }
    let accepted = 0;
    for (const row of rows) {
      if (row.messageId <= (this.cursors.get(row.channelId) ?? 0)) {
        continue;
      }
      const frame = {
        type: 'message:telegram',
        data: {
          peerId: row.channelId,
          messageId: row.messageId,
          text: row.text,
          occurredAt: row.occurredAt,
          messageType: row.messageType,
        },
      };
      if (this.acceptRealtimeFrame(frame)) {
        accepted += 1;
      }
    }
    return accepted;
  }

  private advanceCursor(frame: unknown): void {
    const data = (frame as { data?: Record<string, unknown> }).data;
    if (!data || typeof data !== 'object') {
      return;
    }
    const channelId =
      typeof data['peerId'] === 'string'
        ? data['peerId']
        : typeof data['channelId'] === 'string'
          ? data['channelId']
          : null;
    const messageId =
      typeof data['messageId'] === 'number' &&
      Number.isFinite(data['messageId'])
        ? data['messageId']
        : null;
    if (channelId === null || messageId === null) {
      return;
    }
    const prev = this.cursors.get(channelId) ?? 0;
    if (messageId > prev) {
      this.cursors.set(channelId, messageId);
    }
  }

  private async runSseLoop(): Promise<void> {
    const url = `${this.baseUrl}${STREAM_PATH}`;
    let attempt = 0;
    while (!this.stopped) {
      try {
        attempt = 0;
        await this.connectAndStream(url);
      } catch (error) {
        if (this.stopped) {
          return;
        }
        attempt += 1;
        const delay = this.buildBackoffDelay(attempt);
        this.logger.warn(
          `SSE stream disconnected (attempt ${attempt}), reconnecting in ${delay}ms: ${error instanceof Error ? error.message : String(error)}`,
        );
        const caughtUp = await this.catchUpAfterReconnect();
        if (caughtUp > 0) {
          this.logger.log(
            `Catch-up accepted ${caughtUp} missed crypto-news row(s)`,
          );
        }
        await this.sleep(delay);
      }
    }
  }

  private async connectAndStream(url: string): Promise<void> {
    this.abortController = new AbortController();
    let response: Response;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (this.apiKey.length > 0) {
      headers['x-api-key'] = this.apiKey;
    }
    try {
      response = await fetch(url, {
        headers,
        signal: this.abortController.signal,
      });
    } catch (error) {
      throw new Error(
        `SSE connect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      throw new Error(`SSE connection failed: HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error('SSE response has no body');
    }
    this.logger.log(`Crypto-news SSE stream connected: ${url}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!this.stopped) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          if (!chunk.trim()) {
            continue;
          }
          const frame = parseSseChunk(chunk, this.logger);
          if (frame) {
            this.acceptRealtimeFrame(frame);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function parseSseChunk(
  chunk: string,
  logger: Logger,
): { type: string; data: unknown } | null {
  let type = '';
  let raw = '';
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) {
      type = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      raw = line.substring(6).trim();
    }
  }
  if (!type || !raw) {
    return null;
  }
  try {
    return { type, data: JSON.parse(raw) as unknown };
  } catch (error) {
    logger.warn(
      `Malformed SSE frame ignored (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}
