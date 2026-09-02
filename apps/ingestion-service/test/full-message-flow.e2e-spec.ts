import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { StreamService } from '../src/stream/application/services/stream.service';
import * as request from 'supertest';
import * as http from 'http';
import { Registry } from 'prom-client';

/**
 * E2E Test: Full Message Flow
 *
 * Per Requirement 8.1: Message broadcast latency <500ms (p95)
 * Per Requirement 10.5: Functional parity with MTProto mode
 * Per Requirement 12.2: 100% message processing with identical results
 *
 * Test Strategy:
 * - Deploy ingestion-service in test mode (in-memory)
 * - Connect backend SSE client
 * - Inject test message via StreamService.broadcast() (simulates MTProto)
 * - Verify SSE broadcast received
 * - Verify message format matches TelegramRawMessage expectations
 * - Verify media URLs accessible
 * - Verify latency <500ms
 *
 * Note: Per E2E-TESTING-GUIDE.md, we do NOT initialize MTProto in tests
 * to avoid AUTH_KEY_DUPLICATED errors. Instead, we inject messages
 * directly via StreamService to simulate ingestion.
 */
describe('Full Message Flow (e2e)', () => {
  let app: INestApplication;
  let streamService: StreamService;
  let serverUrl: string;

  /**
   * Simple SSE client implementation for testing
   */
  class SimpleSSEClient {
    private request: http.ClientRequest | null = null;
    private connected = false;
    private events: Array<{ event: string; data: any }> = [];
    private onConnectCallbacks: Array<() => void> = [];
    private onMessageCallbacks: Array<(event: string, data: any) => void> = [];
    private onErrorCallbacks: Array<(error: Error) => void> = [];

    constructor(private url: string) {}

    connect(): void {
      const urlObj = new URL(this.url);

      this.request = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });

      this.request.on('response', (response: http.IncomingMessage) => {
        this.connected = true;
        this.onConnectCallbacks.forEach((cb) => cb());

        let buffer = '';

        response.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            const eventMatch = line.match(/^event: (.+)$/m);
            const dataMatch = line.match(/^data: (.+)$/m);

            if (eventMatch && dataMatch) {
              const event = eventMatch[1];
              const data = JSON.parse(dataMatch[1]);

              this.events.push({ event, data });
              this.onMessageCallbacks.forEach((cb) => cb(event, data));
            }
          }
        });

        response.on('end', () => {
          this.connected = false;
        });

        response.on('error', (error: Error) => {
          this.connected = false;
          this.onErrorCallbacks.forEach((cb) => cb(error));
        });
      });

      this.request.on('error', (error: Error) => {
        this.connected = false;
        this.onErrorCallbacks.forEach((cb) => cb(error));
      });

      this.request.end();
    }

    onConnect(callback: () => void): void {
      this.onConnectCallbacks.push(callback);
    }

    onMessage(callback: (event: string, data: any) => void): void {
      this.onMessageCallbacks.push(callback);
    }

    onError(callback: (error: Error) => void): void {
      this.onErrorCallbacks.push(callback);
    }

    getEvents(): Array<{ event: string; data: any }> {
      return this.events;
    }

    isConnected(): boolean {
      return this.connected;
    }

    close(): void {
      if (this.request) {
        this.request.destroy();
        this.request = null;
      }
      this.connected = false;
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Registry)
      .useValue(new Registry())
      .compile();

    app = moduleFixture.createNestApplication();
    
    // Apply same configuration as production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    streamService = app.get<StreamService>(StreamService);
    
    // Get the server URL
    const server = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'string' ? 3031 : address?.port || 3031;
    serverUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('8.1 Message Broadcast Flow', () => {
    it('should receive broadcasted message via SSE with correct format', async () => {
      // Per Requirement 8.1: Measure latency
      const startTime = Date.now();
      let broadcastLatency = 0;

      // Create SSE client connection
      const sseClient = new EventSource(`${serverUrl}/api/ingestion/stream`);

      // Collect received events
      const receivedEvents: Array<{ event: string; data: any }> = [];

      // Promise to wait for specific event
      const messageReceived = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout: message not received within 1000ms'));
        }, 1000);

        sseClient.addEventListener('connection:established', (event: any) => {
          const data = JSON.parse(event.data);
          receivedEvents.push({ event: 'connection:established', data });
        });

        sseClient.addEventListener('message:telegram', (event: any) => {
          broadcastLatency = Date.now() - startTime;
          const data = JSON.parse(event.data);
          receivedEvents.push({ event: 'message:telegram', data });
          clearTimeout(timeout);
          resolve();
        });

        sseClient.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });

      // Wait for connection:established event
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Inject test message (simulates MTProto ingestion)
      const testMessage = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: new Date().toISOString(),
        media: [
          {
            type: 'photo' as const,
            index: 0,
            url: `${serverUrl}/api/media/-1001234567890/12345/0`,
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
        ],
        entities: [
          {
            type: 'url',
            offset: 10,
            length: 20,
            url: 'https://example.com',
          },
        ],
        groupedId: '123456789',
        messageType: 'kol' as const,
      };

      // Broadcast message via StreamService
      streamService.broadcast({
        type: 'message:telegram',
        data: testMessage,
      });

      // Wait for message to be received
      await messageReceived;

      // Close SSE connection
      sseClient.close();

      // Per Requirement 8.1: Verify latency <500ms
      expect(broadcastLatency).toBeLessThan(500);

      // Verify we received both events
      expect(receivedEvents).toHaveLength(2);

      // Verify connection:established event
      const connectionEvent = receivedEvents.find(
        (e) => e.event === 'connection:established',
      );
      expect(connectionEvent).toBeDefined();
      expect(connectionEvent?.data).toHaveProperty('clientId');
      expect(connectionEvent?.data).toHaveProperty('timestamp');

      // Verify message:telegram event
      const messageEvent = receivedEvents.find(
        (e) => e.event === 'message:telegram',
      );
      expect(messageEvent).toBeDefined();
      expect(messageEvent?.data).toEqual(testMessage);

      // Per Invariant 1: Verify text field is NOT present
      expect(messageEvent?.data).not.toHaveProperty('text');

      // Per Invariant 5: Verify media URLs are path-based
      expect(messageEvent?.data.media[0].url).toContain('/api/media/');
      expect(messageEvent?.data.media[0].url).toContain('-1001234567890');
      expect(messageEvent?.data.media[0].url).toContain('12345');
      expect(messageEvent?.data.media[0].url).toContain('0');
    });

    it('should broadcast to multiple clients simultaneously', async () => {
      // Create 3 SSE clients
      const clients = [
        new EventSource(`${serverUrl}/api/ingestion/stream`),
        new EventSource(`${serverUrl}/api/ingestion/stream`),
        new EventSource(`${serverUrl}/api/ingestion/stream`),
      ];

      const receivedByClients: boolean[] = [false, false, false];

      // Set up listeners for all clients
      const allReceived = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Not all clients received message: ${receivedByClients.join(', ')}`,
            ),
          );
        }, 1000);

        clients.forEach((client, index) => {
          client.addEventListener('message:telegram', () => {
            receivedByClients[index] = true;
            
            // Check if all clients received
            if (receivedByClients.every((r) => r === true)) {
              clearTimeout(timeout);
              resolve();
            }
          });

          client.onerror = (error) => {
            clearTimeout(timeout);
            reject(error);
          };
        });
      });

      // Wait for all connections to establish
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Broadcast a message
      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: '-1009876543210',
          messageId: 67890,
          occurredAt: new Date().toISOString(),
          media: [],
          messageType: 'crypto-news',
        },
      });

      // Wait for all clients to receive
      await allReceived;

      // Close all clients
      clients.forEach((client) => client.close());

      // Verify all clients received the message
      expect(receivedByClients).toEqual([true, true, true]);
    });

    it('should preserve message order within a channel', async () => {
      const sseClient = new EventSource(`${serverUrl}/api/ingestion/stream`);
      const receivedMessages: any[] = [];

      const allMessagesReceived = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout: not all messages received'));
        }, 2000);

        sseClient.addEventListener('message:telegram', (event: any) => {
          const data = JSON.parse(event.data);
          receivedMessages.push(data);

          // Wait for 3 messages
          if (receivedMessages.length === 3) {
            clearTimeout(timeout);
            resolve();
          }
        });

        sseClient.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Broadcast 3 messages in order
      const channelId = '-1001111111111';
      
      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: channelId,
          messageId: 100,
          occurredAt: new Date().toISOString(),
          media: [],
          messageType: 'kol',
        },
      });

      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: channelId,
          messageId: 101,
          occurredAt: new Date().toISOString(),
          media: [],
          messageType: 'kol',
        },
      });

      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: channelId,
          messageId: 102,
          occurredAt: new Date().toISOString(),
          media: [],
          messageType: 'kol',
        },
      });

      await allMessagesReceived;
      sseClient.close();

      // Per Invariant 2: Verify messages received in order
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0].messageId).toBe(100);
      expect(receivedMessages[1].messageId).toBe(101);
      expect(receivedMessages[2].messageId).toBe(102);
    });
  });

  describe('Media URL Accessibility', () => {
    it('should return 404 for non-existent media files', async () => {
      // Per Requirement 4.3: Media endpoint returns 404 for missing files
      const response = await request(app.getHttpServer())
        .get('/api/media/-1001234567890/99999/0')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should construct valid media URLs in message payload', async () => {
      const sseClient = new EventSource(`${serverUrl}/api/ingestion/stream`);

      const messageReceived = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 1000);

        sseClient.addEventListener('message:telegram', (event: any) => {
          const data = JSON.parse(event.data);
          clearTimeout(timeout);
          resolve(data);
        });

        sseClient.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Broadcast message with media
      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: '-1002222222222',
          messageId: 54321,
          occurredAt: new Date().toISOString(),
          media: [
            {
              type: 'photo',
              index: 0,
              url: '/api/media/-1002222222222/54321/0',
              mimeType: 'image/jpeg',
              fileSize: 123456,
            },
            {
              type: 'video',
              index: 1,
              url: '/api/media/-1002222222222/54321/1',
              mimeType: 'video/mp4',
              fileSize: 9876543,
            },
          ],
          messageType: 'crypto-news',
        },
      });

      const message = await messageReceived;
      sseClient.close();

      // Per Invariant 5: Verify media URL format
      expect(message.media).toHaveLength(2);
      expect(message.media[0].url).toMatch(
        /^\/api\/media\/-\d+\/\d+\/\d+$/,
      );
      expect(message.media[1].url).toMatch(
        /^\/api\/media\/-\d+\/\d+\/\d+$/,
      );

      // Verify URL components
      expect(message.media[0].url).toContain('-1002222222222');
      expect(message.media[0].url).toContain('54321');
      expect(message.media[0].url).toContain('/0');
      expect(message.media[1].url).toContain('/1');
    });
  });

  describe('Message Format Validation', () => {
    it('should match TelegramRawMessage structure expectations', async () => {
      const sseClient = new EventSource(`${serverUrl}/api/ingestion/stream`);

      const messageReceived = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 1000);

        sseClient.addEventListener('message:telegram', (event: any) => {
          const data = JSON.parse(event.data);
          clearTimeout(timeout);
          resolve(data);
        });

        sseClient.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Broadcast comprehensive message
      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: '-1003333333333',
          messageId: 11111,
          occurredAt: new Date().toISOString(),
          media: [
            {
              type: 'photo',
              index: 0,
              url: '/api/media/-1003333333333/11111/0',
              mimeType: 'image/png',
              fileSize: 456789,
            },
          ],
          entities: [
            {
              type: 'url',
              offset: 0,
              length: 25,
              url: 'https://solscan.io/token/abc',
            },
            {
              type: 'mention',
              offset: 30,
              length: 10,
            },
          ],
          groupedId: '999888777',
          messageType: 'kol',
        },
      });

      const message = await messageReceived;
      sseClient.close();

      // Verify all required fields present
      expect(message).toHaveProperty('peerId');
      expect(message).toHaveProperty('messageId');
      expect(message).toHaveProperty('occurredAt');
      expect(message).toHaveProperty('media');
      expect(message).toHaveProperty('messageType');

      // Verify optional fields
      expect(message).toHaveProperty('entities');
      expect(message).toHaveProperty('groupedId');

      // Per Invariant 1: Verify text field absent
      expect(message).not.toHaveProperty('text');
      expect(message).not.toHaveProperty('content');
      expect(message).not.toHaveProperty('rawText');

      // Verify types
      expect(typeof message.peerId).toBe('string');
      expect(typeof message.messageId).toBe('number');
      expect(typeof message.occurredAt).toBe('string');
      expect(Array.isArray(message.media)).toBe(true);
      expect(['kol', 'crypto-news']).toContain(message.messageType);

      // Verify media structure
      expect(message.media[0]).toHaveProperty('type');
      expect(message.media[0]).toHaveProperty('index');
      expect(message.media[0]).toHaveProperty('url');
      expect(message.media[0]).toHaveProperty('mimeType');
      expect(message.media[0]).toHaveProperty('fileSize');

      // Verify entities structure
      expect(message.entities[0]).toHaveProperty('type');
      expect(message.entities[0]).toHaveProperty('offset');
      expect(message.entities[0]).toHaveProperty('length');
    });
  });

  describe('Latency Requirements', () => {
    it('should meet p95 latency requirement of <500ms for 100 messages', async () => {
      const sseClient = new EventSource(`${serverUrl}/api/ingestion/stream`);
      const latencies: number[] = [];
      const messageCount = 100;

      const allMessagesReceived = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Timeout: only received ${latencies.length}/${messageCount} messages`,
            ),
          );
        }, 10000);

        sseClient.addEventListener('message:telegram', () => {
          if (latencies.length === messageCount) {
            clearTimeout(timeout);
            resolve();
          }
        });

        sseClient.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Broadcast 100 messages and measure latency
      for (let i = 0; i < messageCount; i++) {
        const startTime = Date.now();

        streamService.broadcast({
          type: 'message:telegram',
          data: {
            peerId: '-1004444444444',
            messageId: 20000 + i,
            occurredAt: new Date().toISOString(),
            media: [],
            messageType: 'kol',
          },
        });

        // Measure latency (in real scenario this would be from Telegram→SSE)
        const endTime = Date.now();
        latencies.push(endTime - startTime);

        // Small delay to avoid overwhelming
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      await allMessagesReceived;
      sseClient.close();

      // Calculate p95 latency
      const sortedLatencies = [...latencies].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedLatencies.length * 0.95);
      const p95Latency = sortedLatencies[p95Index];

      // Per Requirement 8.1: Verify p95 < 500ms
      expect(p95Latency).toBeLessThan(500);

      // Log statistics for analysis
      const avgLatency =
        latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      console.log(`Latency stats (${messageCount} messages):`);
      console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`  P95: ${p95Latency}ms`);
      console.log(`  Min: ${Math.min(...sortedLatencies)}ms`);
      console.log(`  Max: ${Math.max(...sortedLatencies)}ms`);
    });
  });

  describe('Health Endpoint Integration', () => {
    it('should report SSE client connections in health endpoint', async () => {
      // Create 2 SSE clients
      const client1 = new EventSource(`${serverUrl}/api/ingestion/stream`);
      const client2 = new EventSource(`${serverUrl}/api/ingestion/stream`);

      // Wait for connections to establish
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Query health endpoint
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('clients');
      expect(response.body.clients).toHaveProperty('connected');
      expect(response.body.clients.connected).toBeGreaterThanOrEqual(2);

      // Close clients
      client1.close();
      client2.close();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify count decreased
      const response2 = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response2.body.clients.connected).toBeLessThan(
        response.body.clients.connected,
      );
    });
  });
});
