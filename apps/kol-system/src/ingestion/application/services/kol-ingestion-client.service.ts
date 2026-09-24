import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KolIngestionClientPort,
} from '../../domain/ports/ingestion-client.port';
import { ProcessKolMessageHandler } from '../handlers/process-kol-message.handler';
import {
  isKolFrame,
} from '../../infrastructure/http/dto/raw-kol-message.dto';
import { DEFAULT_INGESTION_BASE_URL } from '../../infrastructure/http/ingestion-http-client.adapter';

const STREAM_PATH = '/api/ingestion/stream';
const POLL_INTERVAL_MS = 60_000;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * KOL ingestion client: realtime SSE + polling fallback.
 *
 * Subscribes to `GET {baseUrl}/api/ingestion/stream` and accepts only
 * frames whose `data` carries the KOL marker (the top-level frame kind
 * is `message:telegram` for every telegram frame, so filtering MUST be
 * client-side on `data.messageType`). A 1-minute polling fallback via
 * the port covers gaps while the stream is down. Disconnects back off
 * from 1s doubling to a 30s cap.
 */
@Injectable()
export class KolIngestionClientService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KolIngestionClientService.name);
  private readonly baseUrl: string;
  private abortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sseLoop: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly config: ConfigService,
    private readonly port: KolIngestionClientPort,
    private readonly handler: ProcessKolMessageHandler = new ProcessKolMessageHandler(),
  ) {
    const fromConfig = config?.get<string>('INGESTION_TELEGRAM_URL');
    const raw =
      (typeof fromConfig === 'string' && fromConfig.trim().length > 0
        ? fromConfig
        : process.env['INGESTION_TELEGRAM_URL']
      )?.trim() || DEFAULT_INGESTION_BASE_URL;
    this.baseUrl = raw.replace(/\/+$/, '');
  }

  async onModuleInit(): Promise<void> {
    this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stop();
  }

  start(): void {
    if (!this.stopped && (this.sseLoop || this.pollTimer)) {
      return;
    }
    this.stopped = false;
    this.sseLoop = this.runSseLoop();
    this.pollTimer = setInterval(() => {
      void this.pollOnce().catch((error) => {
        this.logger.warn(
          `Polling fallback failed (${error instanceof Error ? error.message : String(error)})`,
        );
      });
    }, POLL_INTERVAL_MS);
    this.pollTimer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
   * Accepts one realtime SSE frame. Returns true when a new KOL row
   * was recorded; malformed or non-KOL frames are ignored (no throw).
   */
  acceptRealtimeFrame(frame: unknown): boolean {
    if (!isKolFrame(frame)) {
      return false;
    }
    try {
      return this.handler.handle(frame);
    } catch (error) {
      this.logger.warn(
        `Realtime frame ignored (${error instanceof Error ? error.message : String(error)})`,
      );
      return false;
    }
  }

  /** Polling fallback: fetch recent KOL rows and feed them through the handler. */
  async pollOnce(limit = 50): Promise<number> {
    const rows = await this.port.fetchRecentKolMessages(limit);
    let accepted = 0;
    for (const row of rows) {
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
        await this.sleep(delay);
      }
    }
  }

  private async connectAndStream(url: string): Promise<void> {
    this.abortController = new AbortController();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
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
    this.logger.log(`KOL SSE stream connected: ${url}`);
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
