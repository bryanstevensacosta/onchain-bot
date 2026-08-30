# Centralized Ingestion Service - Design

## 1. Architecture Overview

The Centralized Ingestion Service extracts the Telegram MTProto ingestion layer from backend environments into a standalone microservice. This architecture eliminates resource duplication by maintaining a single MTProto connection and distributing messages to multiple backend clients via Server-Sent Events (SSE).

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TELEGRAM API                                 │
│                    (MTProto)                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Single MTProto Session
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              INGESTION SERVICE (Port 3031)                      │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃ MTProto Layer                                            ┃  │
│  ┃  • TelegramMtprotoListenerAdapter                        ┃  │
│  ┃  • TelegramClientManager                                 ┃  │
│  ┃  • LastSeenManager (Redis)                               ┃  │
│  ┃  • FloodWaitHandler                                      ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                          ↓                                       │
│  ┏━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃ Coordinator Layer                                        ┃  │
│  ┃  • IngestionCoordinator (modified for broadcast)        ┃  │
│  ┃  • KolSeeder                                             ┃  │
│  ┃  • CryptoNewsSeeder                                      ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                          ↓                                       │
│  ┏━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃ API Layer (SSE + HTTP)                                   ┃  │
│  ┃  • StreamService  - manages SSE connections              ┃  │
│  ┃  • StreamController - GET /api/ingestion/stream          ┃  │
│  ┃  • MediaController  - GET /api/media/:channelId/...      ┃  │
│  ┃  • HealthController - GET /api/health                    ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              │ SSE       │ SSE       │ SSE
              ▼           ▼           ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │   Backend    │ │   Backend    │ │   Backend    │
   │     DEV      │ │   STAGING    │ │     PROD     │
   │              │ │              │ │              │
   │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │
   │ │SSE Client│ │ │ │SSE Client│ │ │ │SSE Client│ │
   │ │ Adapter  │ │ │ │ Adapter  │ │ │ │ Adapter  │ │
   │ └────┬─────┘ │ │ └────┬─────┘ │ │ └────┬─────┘ │
   │      │       │ │      │       │ │      │       │
   │      ▼       │ │      ▼       │ │      ▼       │
   │ Ingestion   │ │ Ingestion   │ │ Ingestion   │
   │ Coordinator │ │ Coordinator │ │ Coordinator │
   │ (unchanged) │ │ (unchanged) │ │ (unchanged) │
   └──────────────┘ └──────────────┘ └──────────────┘
```

### 1.2 Key Design Principles

**Per Requirement 1.1, 1.2, 1.3:**
- **Single Source of Truth:** One MTProto client eliminates duplication
- **Media Once:** Download each media file exactly once, serve via HTTP
- **Stateless Backends:** Backends no longer manage MTProto sessions

**Per Requirement 2.3, 2.4:**
- **Real-Time Streaming:** SSE provides push-based message delivery with <500ms latency
- **Automatic Reconnection:** Clients handle disconnections transparently

**Per Requirement 3.1, 3.3:**
- **Interface Compatibility:** `TelegramListenerPort` abstraction preserved
- **Drop-In Replacement:** Backend code changes minimal

**Per Architectural Invariant 7:**
- **Session Isolation:** Backend MTProto clients completely removed to prevent AUTH_KEY_DUPLICATED

## 2. Component Design

### 2.1 Ingestion Service Components

#### 2.1.1 MTProto Layer (Extracted from Backend)

**Components Migrated:**
- `TelegramMtprotoListenerAdapter` - Main MTProto polling loop
- `TelegramClientManager` - Session initialization and connection management
- `LastSeenManager` - Redis-backed cursor tracking (per Invariant 6)
- `FloodWaitHandler` / `FloodWaitCounter` / `FloodWaitSleepWindow` - Anti-ban protection
- `IngestionSafetyConfig` - Configuration for staggered polling and sleep windows
- `MtprotoMediaDownloader` - Media file download logic

**Per Requirement 11.1, 11.2:**
- All anti-ban protection logic moves intact to the Ingestion_Service
- Staggered polling with jitter preserved
- FLOOD_WAIT detection and exponential backoff preserved
- Sleep window support preserved

**Modifications:**
- `TelegramMtprotoListenerAdapter.subscribe()` now yields messages to `StreamService` instead of backend use cases
- `MtprotoMediaDownloader` stores files in `uploads/crypto-news/media/` for HTTP serving

#### 2.1.2 Coordinator Layer

**IngestionCoordinator (Modified)**

**Current Behavior:**
```typescript
// Old: calls use cases directly
async route(raw: TelegramRawMessage): Promise<void> {
  if (isCryptoNews(raw.peerId)) {
    await this.storeNewsUseCase.execute(raw);
  } else {
    await this.kolOrchestrator.handle(raw);
  }
}
```

**New Behavior:**
```typescript
// New: broadcasts to all clients
async route(raw: TelegramRawMessage): Promise<void> {
  // Per Invariant 1: Raw text NOT in event payload
  const payload: MessagePayload = {
    peerId: raw.peerId,
    messageId: raw.messageId,
    occurredAt: raw.occurredAt,
    // text field EXCLUDED from broadcast
    media: raw.media.map(m => ({
      type: m.type,
      index: m.index,
      url: this.buildMediaUrl(raw.peerId, raw.messageId, m.index), // Per Invariant 5
      mimeType: m.mimeType,
      fileSize: m.fileSize,
    })),
    entities: raw.entities,
    groupedId: raw.groupedId,
  };

  // Per Invariant 2: Sequential broadcast per channel
  await this.streamService.broadcast(payload);
}

private buildMediaUrl(channelId: string, messageId: number, index: number): string {
  const baseUrl = this.config.get('INGESTION_API_BASE_URL');
  return `${baseUrl}/api/media/${channelId}/${messageId}/${index}`;
}
```

**Per Invariant 1:**
- `text` field excluded from SSE payload (ToS compliance)
- Raw text stored in Postgres table `telegram_raw_messages` (existing table)
- Backends retrieve text via separate DB query if needed

**KolSeeder / CryptoNewsSeeder (Unchanged)**
- Configuration parsing logic unchanged
- Seeders run at startup to join configured channels

#### 2.1.3 API Layer (New Components)

**StreamService**

Manages SSE client connections and broadcasts messages.

```typescript
@Injectable()
export class StreamService {
  private clients = new Map<string, ServerResponse>();

  // Per Requirement 2.1: SSE endpoint registration
  addClient(clientId: string, response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send connection ready event
    this.sendEvent(response, 'connection:ready', {
      timestamp: new Date().toISOString(),
      channels: this.channelCount,
    });

    this.clients.set(clientId, response);
    this.logger.log(`SSE client connected: ${clientId} (total: ${this.clients.size})`);
  }

  // Per Requirement 2.3: Message broadcasting
  async broadcast(payload: MessagePayload): Promise<void> {
    const event = {
      type: 'message:ingested',
      data: payload,
    };

    // Per Invariant 2: Sequential delivery (no Promise.all)
    for (const [clientId, response] of this.clients.entries()) {
      try {
        this.sendEvent(response, event.type, event.data);
      } catch (error) {
        this.logger.error(`Failed to send to client ${clientId}`, error);
        this.removeClient(clientId);
      }
    }
  }

  private sendEvent(response: ServerResponse, event: string, data: any): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    response.write(payload);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.logger.log(`SSE client disconnected: ${clientId} (total: ${this.clients.size})`);
  }

  // Heartbeat every 30s to prevent proxy timeouts
  @Cron('*/30 * * * * *')
  sendHeartbeat(): void {
    this.broadcast({
      type: 'health:ping',
      data: { timestamp: new Date().toISOString(), uptime: process.uptime() },
    });
  }
}
```

**StreamController**

```typescript
@Controller('api/ingestion')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  // Per Requirement 2.1: SSE streaming endpoint
  @Get('stream')
  @Sse()
  stream(@Req() request: Request, @Res() response: Response): void {
    const clientId = randomUUID();
    this.streamService.addClient(clientId, response);

    // Cleanup on disconnect
    request.on('close', () => {
      this.streamService.removeClient(clientId);
    });
  }
}
```

**MediaController**

```typescript
@Controller('api/media')
export class MediaController {
  constructor(
    @Inject('UPLOADS_ROOT') private readonly uploadsRoot: string,
  ) {}

  // Per Requirement 4.1, 4.2: Media serving endpoint
  @Get(':channelId/:messageId/:index')
  async serveMedia(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Param('index') index: string,
    @Res() response: Response,
  ): Promise<void> {
    // Per existing media storage convention
    const mediaDir = path.join(this.uploadsRoot, 'crypto-news/media', channelId);
    const filePattern = `${messageId}-${index}.*`;
    const files = await fs.readdir(mediaDir);
    const match = files.find(f => minimatch(f, filePattern));

    // Per Requirement 4.3: 404 for missing files
    if (!match) {
      response.status(404).json({ error: 'Media not found' });
      return;
    }

    const filePath = path.join(mediaDir, match);
    const stat = await fs.stat(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    // Per Requirement 4.5: Caching headers
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', stat.size);
    response.setHeader('ETag', `"${stat.mtime.getTime()}"`);
    response.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year

    const stream = fs.createReadStream(filePath);
    stream.pipe(response);
  }
}
```

**HealthController**

```typescript
@Controller('api')
export class HealthController {
  constructor(
    private readonly clientManager: TelegramClientManager,
    private readonly streamService: StreamService,
    private readonly floodWaitCounter: FloodWaitCounter,
  ) {}

  // Per Requirement 5.1, 5.2: Health endpoint
  @Get('health')
  async getHealth(): Promise<HealthResponse> {
    const mtprotoConnected = await this.clientManager.isConnected();
    const mtprotoAuthorized = await this.clientManager.isAuthorized();

    // Per Requirement 5.4, 5.5: HTTP status code logic
    const status = mtprotoConnected && mtprotoAuthorized ? 200 : 503;

    const response: HealthResponse = {
      status: status === 200 ? 'ok' : 'degraded',
      mtproto: {
        connected: mtprotoConnected,
        authorized: mtprotoAuthorized,
        lastPollAt: this.clientManager.getLastPollTimestamp()?.toISOString(),
      },
      channels: {
        total: this.clientManager.getChannelCount(),
        active: this.clientManager.getActiveChannelCount(),
        kol: this.clientManager.getKolChannelCount(),
        news: this.clientManager.getNewsChannelCount(),
      },
      clients: {
        connected: this.streamService.getClientCount(),
      },
      floodWait: {
        count24h: this.floodWaitCounter.getCount24h(),
        maxSeconds24h: this.floodWaitCounter.getMaxSeconds24h(),
        consecutiveFailures: this.floodWaitCounter.getConsecutiveFailures(),
      },
      uptime: process.uptime() * 1000, // milliseconds
    };

    return response; // NestJS will set status code automatically
  }

  // Per Requirement 5.3: Channel metadata endpoint
  @Get('channels')
  async getChannels(): Promise<ChannelMetadata[]> {
    return this.clientManager.getChannelMetadata();
  }
}
```

### 2.2 Backend Client Components (New)

#### 2.2.1 SseIngestionClientAdapter

**Per Requirement 3.1, 3.2, 3.3:**
Implements `TelegramListenerPort` interface for drop-in replacement.

```typescript
export class SseIngestionClientAdapter implements TelegramListenerPort {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30_000; // 30s max backoff

  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  // Per Requirement 3.2: SSE connection establishment
  async *subscribe(channelIds: string[]): AsyncGenerator<TelegramRawMessage> {
    const url = this.buildStreamUrl();
    
    while (true) {
      try {
        yield* this.connectAndStream(url, channelIds);
      } catch (error) {
        // Per Requirement 2.4: Exponential backoff reconnection
        const delay = this.calculateBackoff();
        this.logger.warn(
          `SSE connection failed, reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
          error,
        );
        await this.sleep(delay);
      }
    }
  }

  private async *connectAndStream(
    url: string,
    channelIds: string[],
  ): AsyncGenerator<TelegramRawMessage> {
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(0), // No timeout (SSE is long-lived)
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    this.reconnectAttempts = 0; // Reset on successful connection
    this.logger.log('SSE connection established');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop()!; // Keep incomplete message in buffer

      for (const line of lines) {
        const message = this.parseSSE(line);
        if (message?.event === 'message:ingested') {
          // Per Requirement 3.3: Emit same format as MTProto adapter
          const raw = this.payloadToRawMessage(message.data);
          
          // Filter by subscribed channels
          if (channelIds.includes(raw.peerId)) {
            yield raw;
          }
        }
      }
    }
  }

  private payloadToRawMessage(payload: MessagePayload): TelegramRawMessage {
    return {
      peerId: payload.peerId,
      messageId: payload.messageId,
      text: '', // Per Invariant 1: text not in SSE payload
      occurredAt: new Date(payload.occurredAt),
      media: payload.media.map(m => ({
        type: m.type,
        index: m.index,
        filePath: m.url, // Per Invariant 5: URL instead of local path
        mimeType: m.mimeType,
        fileSize: m.fileSize,
      })),
      entities: payload.entities,
      groupedId: payload.groupedId,
    };
  }

  // Per Requirement 2.4: Exponential backoff with 30s cap
  private calculateBackoff(): number {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    return delay;
  }

  private buildStreamUrl(): string {
    const baseUrl = this.config.get<string>('INGESTION_REMOTE_URL');
    return `${baseUrl}/api/ingestion/stream`;
  }

  private parseSSE(line: string): { event: string; data: any } | null {
    const eventMatch = line.match(/^event: (.+)$/m);
    const dataMatch = line.match(/^data: (.+)$/m);

    if (!eventMatch || !dataMatch) return null;

    return {
      event: eventMatch[1],
      data: JSON.parse(dataMatch[1]),
    };
  }

  // Per Requirement 3.4: Interface compatibility (no-op methods)
  async backfill(channelId: string, limit: number): Promise<TelegramRawMessage[]> {
    this.logger.warn('backfill() not supported in SSE mode');
    return [];
  }

  async disconnect(): Promise<void> {
    this.eventSource?.close();
    this.eventSource = null;
  }

  async resolveChannelMetadata(channelId: string): Promise<ChannelMetadata> {
    // Fetch from ingestion service /api/channels endpoint
    const url = `${this.config.get('INGESTION_REMOTE_URL')}/api/channels`;
    const response = await fetch(url);
    const channels = await response.json();
    return channels.find((c: any) => c.id === channelId);
  }

  async joinChannel(channelId: string): Promise<void> {
    this.logger.warn('joinChannel() not supported in SSE mode (configure in ingestion service)');
  }
}
```

#### 2.2.2 IngestionClientModule (Factory Pattern)

**Per Requirement 7.1: Feature flag for MTProto/SSE mode toggle**

```typescript
@Module({})
export class IngestionClientModule {
  static forRoot(): DynamicModule {
    return {
      module: IngestionClientModule,
      providers: [
        {
          provide: TelegramListenerPort,
          useFactory: (config: ConfigService, logger: Logger) => {
            const mode = config.get<string>('INGESTION_MODE', 'local');

            if (mode === 'remote') {
              logger.log('Using SSE ingestion client (remote mode)');
              return new SseIngestionClientAdapter(config, logger);
            }

            // Per Requirement 7.4: Rollback to MTProto
            logger.log('Using MTProto ingestion client (local mode)');
            return new TelegramMtprotoListenerAdapter(
              /* ... existing dependencies ... */
            );
          },
          inject: [ConfigService, Logger],
        },
      ],
      exports: [TelegramListenerPort],
    };
  }
}
```

**Per Requirement 7.3:**
When `INGESTION_MODE=remote`, MTProto client is NOT initialized, avoiding AUTH_KEY_DUPLICATED errors (Invariant 7).

## 3. Data Flow & Sequences

### 3.1 Message Ingestion Flow (Ingestion Service)

**Per Requirement 1.2, 2.3, Invariant 2:**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Telegram API (MTProto polling)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │ New message received
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. TelegramMtprotoListenerAdapter.subscribe()                  │
│     - Yields TelegramRawMessage                                 │
│     - Downloads media via MtprotoMediaDownloader                │
│     - Saves to uploads/crypto-news/media/{channelId}/           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. IngestionCoordinator.route(raw)                             │
│     - Constructs MessagePayload (text EXCLUDED per Invariant 1) │
│     - Builds media URLs (Invariant 5)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. StreamService.broadcast(payload)                            │
│     - Sequential iteration over clients (Invariant 2)           │
│     - Sends SSE event: message:ingested                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. All connected SSE clients receive event                     │
│     - DEV, STAGING, PROD backends                               │
│     - Latency target: <500ms (Requirement 8.1)                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Message Consumption Flow (Backend)

**Per Requirement 3.2, 3.3, 10.5:**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SseIngestionClientAdapter.subscribe(channelIds)             │
│     - fetch('http://ingestion-service:3031/api/ingestion/stream') │
│     - Establishes SSE connection                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Parse SSE events → TelegramRawMessage                       │
│     - Filters by subscribed channelIds                          │
│     - Constructs media URLs from payload (Invariant 5)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. IngestionCoordinator.route(raw)  [UNCHANGED in backend]     │
│     - Same logic as before                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ├─── [crypto-news path]
                         │    StoreNewsMessageUseCase
                         │    → DB insert + event bus
                         │
                         └─── [KOL path]
                              KolIngestionOrchestrator
                              → ExtractFromMessageUseCase
                              → ParseFromCandidatesUseCase
                              → Normalization/Enrichment/Classification/Scoring
```

**Per Requirement 10.5:**
Identical processing results in both MTProto and SSE modes (functional parity).

### 3.3 Media Access Flow

**Per Requirement 4.2, 4.3, Invariant 5:**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Backend receives message with media URL                     │
│     media: [{                                                   │
│       url: 'http://ingestion-service:3031/api/media/-100.../0'  │
│     }]                                                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Backend makes HTTP GET to media URL                         │
│     (e.g., for display in dashboard or LLM processing)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. MediaController in ingestion-service                        │
│     - Reads file from uploads/crypto-news/media/{channelId}/... │
│     - Returns bytes with Content-Type header                    │
│     - Supports ETag/Cache-Control (Requirement 4.5)             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Backend processes media (latency <200ms, Requirement 8.3)   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Deduplication Flow

**Per Invariant 3:**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Message received from Telegram                              │
│     peerId: -1001234567890, messageId: 12345                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. LastSeenManager.isAlreadySeen(peerId, messageId)            │
│     - Query Redis: GET ingestion:lastSeen:-1001234567890        │
│     - Stored value: 12344                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Decision                                                    │
│     messageId 12345 > lastSeen 12344 → PROCESS                  │
│     messageId 12344 ≤ lastSeen 12344 → SKIP (duplicate)         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Update cursor after broadcast                               │
│     SET ingestion:lastSeen:-1001234567890 = 12345               │
└─────────────────────────────────────────────────────────────────┘
```

**Per Invariant 6:**
Cursor state persists in Redis, survives service restarts.

## 4. API Specification

### 4.1 SSE Streaming Endpoint

**Per Requirement 2.1, 2.3:**

**Endpoint:** `GET /api/ingestion/stream`

**Headers:**
```
Accept: text/event-stream
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Events:**

#### 4.1.1 Connection Ready Event

```
event: connection:ready
data: {"timestamp":"2026-08-30T00:00:00Z","channels":15}

```

#### 4.1.2 Message Ingested Event

**Per Invariant 1 (text excluded), Invariant 5 (media as URLs):**

```
event: message:ingested
data: {
  "peerId": "-1001234567890",
  "messageId": 12345,
  "occurredAt": "2026-08-30T00:01:00Z",
  "media": [{
    "type": "photo",
    "index": 0,
    "url": "/api/media/-1001234567890/12345/0",
    "mimeType": "image/jpeg",
    "fileSize": 245678
  }],
  "entities": [{
    "type": "url",
    "offset": 10,
    "length": 20,
    "url": "https://example.com"
  }],
  "groupedId": "123456789"
}

```

**Note:** `text` field intentionally absent (Invariant 1).

#### 4.1.3 Heartbeat Event

**Per Requirement 2.4: Keep-alive to prevent proxy timeouts**

```
event: health:ping
data: {"timestamp":"2026-08-30T00:02:00Z","uptime":120000}

```

### 4.2 Media Serving Endpoint

**Per Requirement 4.1, 4.2, 4.3, 4.5:**

**Endpoint:** `GET /api/media/:channelId/:messageId/:index`

**Example:** `GET /api/media/-1001234567890/12345/0`

**Response (Success):**
```
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 245678
ETag: "1735603200000"
Cache-Control: public, max-age=31536000

<binary file content>
```

**Response (Not Found):**
```
HTTP/1.1 404 Not Found
Content-Type: application/json

{"error":"Media not found"}
```

### 4.3 Health Endpoint

**Per Requirement 5.1, 5.2, 5.4, 5.5, 5.6:**

**Endpoint:** `GET /api/health`

**Response (Healthy):**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "mtproto": {
    "connected": true,
    "authorized": true,
    "lastPollAt": "2026-08-30T00:00:00Z"
  },
  "channels": {
    "total": 15,
    "active": 15,
    "kol": 10,
    "news": 5
  },
  "clients": {
    "connected": 3
  },
  "floodWait": {
    "count24h": 2,
    "maxSeconds24h": 30,
    "consecutiveFailures": 0
  },
  "uptime": 3600000
}
```

**Response (Degraded - MTProto disconnected):**
```json
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "status": "degraded",
  "mtproto": {
    "connected": false,
    "authorized": true,
    "lastPollAt": "2026-08-30T00:00:00Z"
  },
  "channels": {
    "total": 15,
    "active": 0,
    "kol": 10,
    "news": 5
  },
  "clients": {
    "connected": 3
  },
  "floodWait": {
    "count24h": 5,
    "maxSeconds24h": 120,
    "consecutiveFailures": 3
  },
  "uptime": 3600000
}
```

### 4.4 Channels Metadata Endpoint

**Per Requirement 5.3:**

**Endpoint:** `GET /api/channels`

**Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": "-1001234567890",
    "title": "Crypto News Channel",
    "participantCount": 15000,
    "type": "news",
    "joinedAt": "2026-01-01T00:00:00Z"
  },
  {
    "id": "-1009876543210",
    "title": "KOL Alpha Signals",
    "participantCount": 5000,
    "type": "kol",
    "joinedAt": "2026-02-01T00:00:00Z"
  }
]
```

## 5. State Management

### 5.1 Ingestion Service State

**Per Requirement 1.5, Invariant 6, Requirement 11.2:**

| State | Storage | TTL | Purpose | Requirement |
|-------|---------|-----|---------|-------------|
| MTProto session | Env var `INGESTION_TELEGRAM_MTPROTO_SESSION` | Permanent | Authentication | 1.5 |
| Last-seen IDs | Redis `ingestion:lastSeen:{channelId}` | Permanent | Cursor tracking (Invariant 6) | Invariant 6 |
| FLOOD_WAIT counters | In-memory (FloodWaitCounter) | 24h sliding window | Ban risk tracking | 11.2, 11.7 |
| SSE client connections | In-memory Map<clientId, Response> | Connection lifetime | Broadcast targets | 2.1 |
| Media files | Disk `uploads/crypto-news/media/` | Configurable retention (default 30d) | File serving | 4.4 |
| Channel metadata | In-memory (cached from MTProto) | Until restart | Metadata API | 5.3 |

### 5.2 Backend Client State

| State | Storage | Purpose | Requirement |
|-------|---------|---------|-------------|
| SSE connection | In-memory (fetch stream) | Active stream | 3.2 |
| Reconnection backoff | In-memory (counter + timer) | Exponential backoff timer | 2.4 |
| Ingestion mode | Config `INGESTION_MODE` | local/remote switch | 7.1 |

## 6. Configuration

### 6.1 Ingestion Service Environment Variables

**Per Requirement 6.2:**

```bash
# ─────────────────────────────────────────────────────────────
# MTProto Configuration (same as current backend)
# ─────────────────────────────────────────────────────────────
INGESTION_TELEGRAM_MTPROTO_API_ID=12345678
INGESTION_TELEGRAM_MTPROTO_API_HASH=abcdef1234567890abcdef1234567890
INGESTION_TELEGRAM_MTPROTO_SESSION=<base64-encoded-session-string>

# ─────────────────────────────────────────────────────────────
# Channel Seeders (same as current backend)
# ─────────────────────────────────────────────────────────────
# JSON array of KOL channel configurations
INGESTION_TELEGRAM_SEED_KOLS='[
  {"channelId": "-1009876543210", "displayName": "KOL Alpha Signals"}
]'

# JSON array of crypto news channel configurations
INGESTION_TELEGRAM_SEED_NEWS='[
  {"channelId": "-1001234567890", "displayName": "Crypto News Channel"}
]'

# ─────────────────────────────────────────────────────────────
# API Server Configuration (new)
# ─────────────────────────────────────────────────────────────
INGESTION_API_PORT=3031
INGESTION_API_HOST=0.0.0.0
INGESTION_API_BASE_URL=http://localhost:3031  # Used for media URL construction
INGESTION_UPLOADS_ROOT=./uploads  # Media file storage root

# ─────────────────────────────────────────────────────────────
# Redis Configuration (for LastSeenManager - Invariant 6)
# ─────────────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=  # Optional

# ─────────────────────────────────────────────────────────────
# Safety Configuration (Requirement 11)
# ─────────────────────────────────────────────────────────────
INGESTION_SAFETY_MAX_CHANNELS=50  # Requirement 11.1
INGESTION_SAFETY_POLL_INTERVAL_MS=90000  # 90s per channel (Requirement 11.1)
INGESTION_SAFETY_JITTER_PERCENT=30  # ±30% randomization (Requirement 11.1)
INGESTION_SAFETY_SLEEP_WINDOW_START=04:00  # UTC (Requirement 11.3)
INGESTION_SAFETY_SLEEP_WINDOW_END=08:00  # UTC (Requirement 11.3)
INGESTION_SAFETY_FLOOD_THRESHOLD_24H=10  # Alert if >10 in 24h (Requirement 11.2)
```

### 6.2 Backend Environment Variables (Updated)

**Per Requirement 7.1, 7.3:**

```bash
# ─────────────────────────────────────────────────────────────
# Ingestion Mode Toggle
# ─────────────────────────────────────────────────────────────
INGESTION_MODE=remote  # 'local' or 'remote' (Requirement 7.1)
INGESTION_REMOTE_URL=http://ingestion-service:3031  # When mode=remote

# ─────────────────────────────────────────────────────────────
# Disable MTProto in Backend When Remote (Requirement 7.3)
# ─────────────────────────────────────────────────────────────
# When INGESTION_MODE=remote, MTProto client NOT initialized
# Remove or comment out these vars in remote mode:
# INGESTION_TELEGRAM_MTPROTO_API_ID=
# INGESTION_TELEGRAM_MTPROTO_API_HASH=
# INGESTION_TELEGRAM_MTPROTO_SESSION=
```

### 6.3 Safety Configuration File

**Per Requirement 11.6:**

**Path:** `config/ingestion.config.json`

```json
{
  "maxChannels": 50,
  "pollIntervalBaseMs": 90000,
  "jitterPercent": 30,
  "sleepWindow": {
    "start": "04:00",
    "end": "08:00",
    "timezone": "UTC"
  },
  "floodProtection": {
    "initialBackoffMs": 5000,
    "backoffMultiplier": 2,
    "maxBackoffMs": 3600000,
    "maxAttempts": 5,
    "threshold24h": 10
  }
}
```

**Defaults (if file missing):**
- maxChannels: 50
- pollIntervalBaseMs: 90000 (90s)
- jitterPercent: 30
- sleepWindow: 04:00-08:00 UTC
- floodProtection: initial 5s, multiplier 2x, max 1h, max 5 attempts, threshold 10/24h

## 7. Deployment Architecture

### 7.1 Docker Compose (Ingestion Service)

**Per Requirement 6.1, 6.3:**

```yaml
version: '3.8'
services:
  ingestion-service:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ingestion-service
    ports:
      - "3031:3031"
    environment:
      - NODE_ENV=production
      - INGESTION_TELEGRAM_MTPROTO_API_ID=${MTPROTO_API_ID}
      - INGESTION_TELEGRAM_MTPROTO_API_HASH=${MTPROTO_API_HASH}
      - INGESTION_TELEGRAM_MTPROTO_SESSION=${MTPROTO_SESSION}
      - INGESTION_TELEGRAM_SEED_KOLS=${SEED_KOLS}
      - INGESTION_TELEGRAM_SEED_NEWS=${SEED_NEWS}
      - INGESTION_API_PORT=3031
      - INGESTION_API_HOST=0.0.0.0
      - INGESTION_API_BASE_URL=http://144.126.203.139:3031
      - INGESTION_UPLOADS_ROOT=/app/uploads
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_DB=0
    volumes:
      - ./uploads:/app/uploads
      - ./config:/app/config
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: ingestion-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: ingestion-postgres
    environment:
      POSTGRES_USER: ingestion
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ingestion_metadata
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  redis-data:
  pgdata:
```

### 7.2 Network Topology

**Per Requirement 6.6, 7.2:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Droplet: 144.126.203.139                                            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Ingestion Service                           :3031              │ │
│  │  ├─ MTProto Client (single session)                             │ │
│  │  ├─ Redis                                    :6379              │ │
│  │  ├─ Postgres (metadata)                      :5432              │ │
│  │  └─ SSE API + Media API + Health API                            │ │
│  └──────────────────────┬──────────────────────────────────────────┘ │
│                         │                                             │
│                         │ HTTP/SSE (internal network)                 │
│                         │                                             │
│           ┌─────────────┼─────────────┐                               │
│           │             │             │                               │
│           ▼             ▼             ▼                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                    │
│  │ Backend     │ │ Backend     │ │ Backend     │                    │
│  │ PROD        │ │ STAGING     │ │ (Future)    │                    │
│  │ :3030       │ │ :3032       │ │ :3033       │                    │
│  └─────────────┘ └─────────────┘ └─────────────┘                    │
│                                                                       │
└───────────────────────────────────┬───────────────────────────────────┘
                                    │
                         SSH Tunnel │ (for local dev)
                                    ▼
                        ┌────────────────────────┐
                        │  Developer Mac (local) │
                        │  Backend DEV  :3030    │
                        │                        │
                        │  SSE via tunnel:       │
                        │  ssh -L 3031:localhost:3031 root@144.126.203.139 │
                        └────────────────────────┘
```

**SSH Tunnel for Local Development:**

```bash
# Forward ingestion service port to local machine
ssh -L 3031:localhost:3031 root@144.126.203.139

# In backend .env.dev (local):
INGESTION_MODE=remote
INGESTION_REMOTE_URL=http://localhost:3031
```

## 8. Migration Strategy (Phased Rollout)

**Per Requirement 7.1, 7.2, 7.3, 7.4, 7.5:**

### Phase 1: Deploy Ingestion Service

**Objective:** Deploy standalone ingestion service without backend connections.

**Steps:**
1. Build and deploy ingestion-service container to droplet
2. Verify health endpoint: `curl http://localhost:3031/api/health` → 200 OK
3. Verify MTProto connects: Check `mtproto.connected: true` in health response
4. Verify channels seeded: Check `channels.total > 0` in health response
5. Monitor logs for successful polling (no FLOOD_WAIT errors)
6. No backends connected yet (service runs standalone for 24h validation)

**Success Criteria:**
- Health endpoint returns 200 for 24h continuous
- Zero FLOOD_WAIT errors in first 24h
- All configured channels successfully joined

### Phase 2: Migrate Staging Backend

**Objective:** Connect staging backend to ingestion service via SSE.

**Steps:**
1. Update staging backend `.env`:
   ```bash
   INGESTION_MODE=remote
   INGESTION_REMOTE_URL=http://localhost:3031
   ```
2. Remove MTProto vars from staging `.env` (Requirement 7.3)
3. Restart staging backend container
4. Monitor staging logs for:
   - "SSE connection established" log entry
   - No MTProto initialization logs
   - Messages arriving via SSE adapter
5. Verify crypto-news messages reach staging database
6. Verify KOL extraction pipeline runs on staging

**Success Criteria:**
- Staging backend receives 100% of messages
- Zero message loss compared to prod (MTProto mode)
- Latency <500ms from Telegram → staging DB insert

### Phase 3: Side-by-Side Validation

**Objective:** Run prod (MTProto) and staging (SSE) in parallel for 48h, compare results.

**Steps:**
1. Prod backend remains in `INGESTION_MODE=local` (MTProto)
2. Staging backend runs in `INGESTION_MODE=remote` (SSE)
3. Monitor both for 48h:
   - Compare message counts in database
   - Compare KOL extraction results
   - Compare crypto-news keyword matches
   - Compare media download counts
4. Validate success criteria (below)

**Success Criteria:**
- ≥99.9% message parity (staging vs prod)
- Identical KOL extraction results for same messages
- Zero SSE disconnections >1min in 48h window
- Staging backend memory usage -300MB vs prod (Requirement 8.3 impact)

### Phase 4: Migrate Production Backend

**Objective:** Cutover prod backend to SSE mode.

**Steps:**
1. Schedule cutover during low-traffic window (e.g., 02:00 UTC Sunday)
2. Update prod backend `.env`:
   ```bash
   INGESTION_MODE=remote
   INGESTION_REMOTE_URL=http://localhost:3031
   ```
3. Remove MTProto vars from prod `.env`
4. Restart prod backend container
5. Monitor for 1 hour:
   - Health endpoint status
   - Message arrival rate
   - SSE connection stability
   - Dashboard functionality
6. If issues detected → **Rollback (see Phase 5)**

**Success Criteria:**
- Prod backend receives 100% of messages within 5min of cutover
- Zero user-facing errors in dashboard
- Monitoring alerts remain silent

### Phase 5: Rollback Procedure (If Needed)

**Per Requirement 7.4, 7.5:**

**Trigger Conditions:**
- Ingestion service health 503 for >5min
- SSE connection failures on prod backend
- Message loss detected (DB insert count drops)

**Steps:**
1. Update prod backend `.env`:
   ```bash
   INGESTION_MODE=local  # Restore MTProto mode
   ```
2. Restore MTProto vars in prod `.env` (from backup)
3. Restart prod backend container
4. Verify MTProto connection established
5. Verify message processing resumes
6. Investigate ingestion service issue (logs, metrics)

**Time to Restore:** <5 minutes (Requirement 7.4)

### Phase 6: Decommission Local MTProto

**Objective:** Remove MTProto code from backend after 7 days of stable SSE operation.

**Steps:**
1. After 7 days of zero incidents in production
2. Optional: Remove `TelegramMtprotoListenerAdapter` from backend codebase
3. Optional: Remove MTProto dependencies from backend `package.json`
4. Update documentation to reflect SSE-only architecture

**Note:** Keep MTProto code for at least 7 days to enable fast rollback if needed.

## 9. Error Handling & Recovery

### 9.1 Ingestion Service Failures

**Per Requirement 9.4:**

| Scenario | Detection | Recovery | Requirement |
|----------|-----------|----------|-------------|
| MTProto disconnected | Health endpoint 503 | TelegramClientManager auto-reconnect (exponential backoff) | 5.5, 9.6 |
| FLOOD_WAIT > threshold | FloodWaitCounter alert | Exponential backoff, operator alert if >10 in 24h | 11.2 |
| Redis connection lost | LastSeenManager error | Fallback to in-memory cursors (logs warning), data loss risk on restart | Invariant 6 |
| Media download failed | MtprotoMediaDownloader catch | Log error, skip media, broadcast message without media URLs | 9.4 |
| SSE client disconnects | StreamService Map.delete | Client auto-reconnects (backend responsibility) | 2.4 |
| Postgres unavailable | Raw message insert failure | Log error, continue broadcasting (Postgres stores raw text only) | - |

**FLOOD_WAIT Handling:**

**Per Requirement 11.2:**

```typescript
async handleFloodWait(error: any): Promise<void> {
  const match = error.message.match(/FLOOD_WAIT_(\d+)/);
  if (!match) return;

  const waitSeconds = parseInt(match[1], 10);
  this.floodWaitCounter.record(waitSeconds);

  // Alert if threshold exceeded
  if (this.floodWaitCounter.getCount24h() > 10) {
    this.alertService.send('High FLOOD_WAIT count detected (>10 in 24h)');
  }

  // Exponential backoff
  const backoff = this.calculateBackoff(waitSeconds);
  this.logger.warn(`FLOOD_WAIT_${waitSeconds} - pausing for ${backoff}ms`);
  await this.sleep(backoff);
}
```

### 9.2 Backend Client Failures

**Per Requirement 2.4, 3.5, 3.6:**

| Scenario | Detection | Recovery | Requirement |
|----------|-----------|----------|-------------|
| SSE connection lost | fetch() error or stream end | Exponential backoff (1s → 30s), retry indefinitely | 2.4 |
| Ingestion service unreachable | Connection timeout (30s) | Retry with backoff, alert operator, manual rollback to local mode | 7.5 |
| Media fetch 404 | HTTP 404 response | Log warning, process message without media, continue | 4.3 |
| Event parsing error | JSON.parse error | Log error with event payload, skip malformed event, continue stream | 9.4 |

**SSE Reconnection Logic:**

```typescript
private calculateBackoff(): number {
  const delay = Math.min(
    1000 * Math.pow(2, this.reconnectAttempts), // Exponential: 1s, 2s, 4s, 8s, 16s, 32s
    30_000, // Cap at 30s
  );
  this.reconnectAttempts++;
  return delay;
}
```

### 9.3 Data Integrity Safeguards

**Per Invariant 3, Invariant 6:**

**Deduplication:**
- LastSeenManager tracks highest messageId per channel
- Prevents re-broadcasting old messages on service restart
- Redis persistence ensures cursors survive restarts

**Order Preservation (Invariant 2):**
- Sequential broadcast loop (no `Promise.all`)
- Messages from same channel delivered in order

**No Buffering (Requirement 10.2):**
- SSE clients receive only new messages (no history replay)
- Disconnected clients miss messages during downtime

## 10. Testing Strategy

### 10.1 Unit Tests

**Ingestion Service:**
- `StreamService.broadcast()` - verify all clients receive event
- `StreamService.addClient()` / `removeClient()` - connection management
- `SseMessageTransformer` - verify `TelegramRawMessage` → SSE event conversion (Invariant 1: text excluded)
- `MediaController.serveMedia()` - verify file serving with correct Content-Type
- `HealthController.getHealth()` - verify status code logic (200 vs 503)

**Backend Client:**
- `SseIngestionClientAdapter.subscribe()` - mock SSE stream, verify yielded messages
- `SseIngestionClientAdapter.payloadToRawMessage()` - verify media URL construction (Invariant 5)
- `SseIngestionClientAdapter.calculateBackoff()` - verify exponential backoff math
- `SseIngestionClientAdapter.parseSSE()` - verify event parsing with edge cases (malformed JSON)

### 10.2 Integration Tests

**Ingestion Service:**
- End-to-end: MTProto poll → broadcast → SSE client receives
- Media download + serve: Download from Telegram → serve via `/api/media`
- Health endpoint: Query health, verify JSON structure
- Deduplication: Send duplicate messageId, verify second is skipped

**Backend Client:**
- End-to-end: Connect to SSE → receive message → process via coordinator
- Reconnection: Disconnect SSE, verify exponential backoff, verify reconnect
- Media fetch: Receive message with media URL, fetch via HTTP, verify bytes

### 10.3 E2E Tests (Staging Environment)

**Per Requirement 12.2, 12.3:**

1. Deploy ingestion-service + backend in remote mode (staging)
2. Trigger real Telegram message (test channel)
3. Verify staging backend database has message within 500ms
4. Verify KOL extraction runs (if KOL message)
5. Verify crypto-news keyword matching runs (if news message)
6. Verify media fetch from ingestion service succeeds
7. Compare staging results vs prod results (functional parity)

### 10.4 Load Tests

**Per Requirement 8.2, 8.5:**

**Scenario:** 10 concurrent SSE clients + 100 messages/min

**Steps:**
1. Spawn 10 SSE clients (simulate 10 backend environments)
2. Inject 100 messages/min via mocked MTProto adapter
3. Measure:
   - Broadcast latency (p50, p95, p99)
   - Memory usage growth over 1 hour
   - SSE connection stability (disconnections)
4. Success criteria:
   - p95 latency <500ms (Requirement 8.1)
   - Zero disconnections (Requirement 8.4)
   - Memory usage stable (no leaks)

## 11. Monitoring & Observability

### 11.1 Ingestion Service Metrics

**Per Requirement 9.5:**

**Prometheus Metrics:**

```typescript
// MTProto connection status
ingestion_mtproto_connected (gauge: 0|1)

// Message throughput
ingestion_messages_received_total (counter, labels: channelId, type)
ingestion_messages_broadcast_total (counter, labels: channelId)
ingestion_messages_broadcast_duration_seconds (histogram)

// SSE clients
ingestion_sse_clients_connected (gauge)
ingestion_sse_client_connects_total (counter)
ingestion_sse_client_disconnects_total (counter)

// FLOOD_WAIT tracking (Requirement 11.7)
ingestion_flood_wait_count_24h (gauge)
ingestion_flood_wait_max_seconds_24h (gauge)
ingestion_flood_wait_consecutive_failures (gauge)

// Media operations
ingestion_media_downloads_total (counter, labels: type)
ingestion_media_download_bytes (histogram)
ingestion_media_download_duration_seconds (histogram)

// API latency
ingestion_api_request_duration_seconds (histogram, labels: endpoint, method, status)
```

### 11.2 Structured Logs (JSON)

**Per Requirement 9.1, 9.2, 9.3:**

**Message Received:**
```json
{
  "level": "info",
  "timestamp": "2026-08-30T00:00:00Z",
  "service": "ingestion",
  "event": "message:received",
  "channelId": "-1001234567890",
  "messageId": 12345,
  "hasMedia": true,
  "mediaCount": 2
}
```

**Client Connected:**
```json
{
  "level": "info",
  "timestamp": "2026-08-30T00:00:00Z",
  "service": "ingestion",
  "event": "sse:client:connected",
  "clientId": "abc-123-def",
  "totalClients": 3
}
```

**FLOOD_WAIT Detected:**
```json
{
  "level": "warn",
  "timestamp": "2026-08-30T00:00:00Z",
  "service": "ingestion",
  "event": "flood_wait:detected",
  "waitSeconds": 30,
  "count24h": 5,
  "backoffMs": 60000
}
```

**Error:**
```json
{
  "level": "error",
  "timestamp": "2026-08-30T00:00:00Z",
  "service": "ingestion",
  "event": "media:download:failed",
  "channelId": "-1001234567890",
  "messageId": 12345,
  "error": "Telegram timeout",
  "stack": "Error: Telegram timeout\n    at ..."
}
```

### 11.3 Alerting Rules

**Per Requirement 9.6:**

| Condition | Severity | Action | Requirement |
|-----------|----------|--------|-------------|
| MTProto disconnected > 5min | 🔴 Critical | Page operator | 9.6 |
| Zero SSE clients > 10min | 🟡 Warning | Slack notification | 9.6 |
| FLOOD_WAIT count > 10 in 24h | 🟡 Warning | Slack notification | 11.2 |
| Consecutive FLOOD_WAIT > 3 | 🔴 Critical | Page operator (ban risk) | 11.7 |
| Media storage > 80% full | 🟡 Warning | Slack notification | 9.6 |
| Health endpoint 503 | 🔴 Critical | Uptime monitor alert | 5.5 |
| SSE broadcast latency p95 > 1s | 🟡 Warning | Slack notification | 8.1 |

**Prometheus Alert Example:**

```yaml
groups:
  - name: ingestion-service
    interval: 30s
    rules:
      - alert: IngestionMtprotoDisconnected
        expr: ingestion_mtproto_connected == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "MTProto disconnected for >5min"

      - alert: IngestionHighFloodWaitRisk
        expr: ingestion_flood_wait_consecutive_failures > 3
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Consecutive FLOOD_WAIT failures indicate ban risk"
```

## 12. Performance Characteristics

### 12.1 Expected Latency

**Per Requirement 8.1, 8.3:**

| Operation | Target (p95) | Rationale |
|-----------|--------------|-----------|
| Message broadcast (MTProto → SSE clients) | < 500ms | Requirement 8.1 |
| Media serving (file read → HTTP response) | < 200ms | Requirement 8.3 |
| Health endpoint response | < 100ms | Requirement 5.2 |
| SSE reconnection (after disconnect) | < 30s | Exponential backoff cap (Requirement 2.4) |
| MTProto reconnection (after disconnect) | < 2min | TelegramClientManager exponential backoff |

### 12.2 Throughput

**Per Requirement 8.2, 8.5:**

| Metric | Target | Notes |
|--------|--------|-------|
| Concurrent SSE clients | 10+ | Requirement 8.2 |
| Messages per minute | 100+ | Requirement 8.5 |
| Media files served per second | 20+ | Estimated from media-heavy channels |
| Media storage growth | ~500MB/day | Estimated (15 channels × 10 media/day × 3MB avg) |

### 12.3 Resource Usage

**Per Requirement 8 (Performance) and Success Criteria 12.1:**

| Resource | Ingestion Service | Backend (Remote Mode) | Net Impact |
|----------|-------------------|----------------------|------------|
| Memory | ~500MB (Node.js + MTProto) | -300MB (no MTProto) | **-400MB total** (3 backends × -300MB + 500MB service) |
| CPU | ~10% (polling + broadcasting) | -5% (no polling) | **-5% total** |
| Disk | +Media files (grows over time) | -Media files (removed) | **-66% duplication** (3x → 1x) |
| Network (inbound from Telegram) | +Polling traffic | -Polling traffic | **-66% reduction** |
| Network (outbound SSE) | +SSE broadcast overhead | +SSE receive overhead | Negligible (text-based events) |

**Justification:**
- 3 backends previously ran MTProto clients: 3 × 300MB = 900MB
- 1 ingestion service: 500MB
- Net memory savings: 900MB - 500MB = **400MB** (44% reduction)
- Media storage: 3x duplication eliminated = **66% reduction**

## 13. Security Considerations

### 13.1 Network Security

**Ingestion Service Exposure:**
- Internal network only (no public internet exposure)
- Backends connect via internal Docker network or SSH tunnel (local dev)
- Media endpoint accessible only to authenticated backends

**SSH Tunnel for Local Dev:**
```bash
# Secure port forward for local development
ssh -L 3031:localhost:3031 root@144.126.203.139
```

### 13.2 Credential Management

**Per Requirement 6.2:**

- MTProto session string stored in `.env` (gitignored)
- Redis password optional (internal network trust)
- Postgres password in `.env` (gitignored)
- No credentials in docker-compose.yml (uses env var substitution)

### 13.3 Media File Access

**Per Requirement 4.2:**

- Media files served via HTTP (no authentication in MVP)
- Future: Add JWT auth for media endpoint if needed
- File paths sanitized (no directory traversal)

### 13.4 Telegram ToS Compliance

**Per External Constraints Section:**

- Read-only operations (no writes)
- Public channels only (no private user data)
- Staggered polling with jitter (mimics human behavior)
- FLOOD_WAIT compliance (automatic backoff)
- Single MTProto session (no AUTH_KEY_DUPLICATED)
- No AI/ML training or data scraping

## 14. Open Questions & Future Enhancements

### 14.1 Open Questions

1. **Media Retention Policy:**
   - How long to retain media files? (Default: 30 days)
   - Automatic cleanup or manual purge?

2. **Backfill Support:**
   - Should SSE clients support backfill (historical messages)?
   - Current design: no backfill (only new messages)

3. **Multi-Region Deployment:**
   - Future: Deploy ingestion service per region?
   - Or: Single global service with edge caching?

### 14.2 Future Enhancements

**Phase 2 (Post-MVP):**
- JWT authentication for media endpoint
- Media CDN integration (CloudFront + S3)
- Grafana dashboard for metrics visualization
- Horizontal scaling (multiple ingestion service instances with Redis pub/sub)

**Phase 3 (Long-term):**
- WebSocket support (in addition to SSE)
- gRPC streaming (for lower latency)
- Multi-region deployment with geo-routing

---

## 15. Appendix

### 15.1 Glossary

- **MTProto:** Telegram's client protocol
- **SSE:** Server-Sent Events (HTTP streaming protocol)
- **FLOOD_WAIT:** Telegram API rate limit error
- **AUTH_KEY_DUPLICATED:** Telegram error when multiple sessions detected
- **LastSeenManager:** Component that tracks last processed messageId per channel

### 15.2 References

- Telegram API Terms: https://core.telegram.org/api/terms
- Telegram API Errors: https://core.telegram.org/api/errors
- SSE Specification: https://html.spec.whatwg.org/multipage/server-sent-events.html
- Project AGENTS.md (root): Architecture decisions and anti-patterns

### 15.3 Migration Checklist

**Pre-Deployment:**
- [ ] Build ingestion-service Docker image
- [ ] Configure environment variables (MTProto session, Redis, seeders)
- [ ] Test health endpoint locally
- [ ] Test SSE streaming locally
- [ ] Test media serving locally

**Deployment:**
- [ ] Deploy ingestion service to droplet
- [ ] Verify health endpoint returns 200
- [ ] Verify MTProto connects
- [ ] Verify channels seeded
- [ ] Monitor for 24h (no FLOOD_WAIT errors)

**Staging Migration:**
- [ ] Update staging backend `.env` (INGESTION_MODE=remote)
- [ ] Remove MTProto vars from staging
- [ ] Restart staging backend
- [ ] Verify SSE connection established
- [ ] Verify messages arrive
- [ ] Verify KOL extraction works
- [ ] Verify crypto-news works

**Production Migration:**
- [ ] Side-by-side validation (48h)
- [ ] Compare message counts (staging vs prod)
- [ ] Compare KOL extraction results
- [ ] Compare crypto-news results
- [ ] Schedule cutover (low-traffic window)
- [ ] Update prod backend `.env`
- [ ] Restart prod backend
- [ ] Monitor for 1h
- [ ] Verify dashboard works
- [ ] Verify alerts silent

**Post-Migration:**
- [ ] Monitor for 7 days
- [ ] Document any incidents
- [ ] Decommission MTProto code (optional)
- [ ] Update documentation
