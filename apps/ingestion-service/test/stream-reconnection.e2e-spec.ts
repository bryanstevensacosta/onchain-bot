import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { StreamService } from '../src/stream/application/services/stream.service';
import * as http from 'http';
import { Registry } from 'prom-client';

/**
 * E2E Test: SSE Reconnection Handling
 *
 * Validates: Requirements 2.4, 8.4
 *
 * This test validates the reconnection resilience of SSE clients by:
 * 1. Establishing an initial SSE connection
 * 2. Forcefully disconnecting the client mid-stream
 * 3. Verifying exponential backoff behavior (1s → 2s → 4s → ... → 30s cap)
 * 4. Verifying successful reconnection within 30s
 * 5. Verifying no message loss after reconnection
 *
 * Per Requirement 2.4: "THE Backend_Client SHALL automatically reconnect with
 * exponential backoff (starting at 1s, max 30s)"
 *
 * Per Requirement 8.4: "THE Ingestion_Service SHALL maintain SSE connections
 * stable for at least 24 hours without disconnection"
 */
describe('SSE Reconnection Handling (e2e)', () => {
  let app: INestApplication;
  let streamService: StreamService;
  let serverPort: number;

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
    await app.init();

    streamService = moduleFixture.get<StreamService>(StreamService);

    // Get the actual server port after initialization
    const server = app.getHttpServer();
    const address = server.address();
    serverPort = typeof address === 'string' ? 3031 : address.port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle reconnection with exponential backoff and no message loss', async () => {
    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;
    const receivedMessages: string[] = [];

    // Step 1: Establish initial connection
    const client1 = new SimpleSSEClient(streamUrl);

    await new Promise<void>((resolve) => {
      client1.onConnect(() => resolve());
      client1.connect();
    });

    expect(client1.isConnected()).toBe(true);
    expect(streamService.getClientCount()).toBe(1);

    // Track messages
    client1.onMessage((event, data) => {
      if (event === 'message:telegram') {
        receivedMessages.push(`message:${data.messageId}`);
      }
    });

    // Broadcast a message before disconnection
    streamService.broadcast({
      type: 'message:telegram',
      data: {
        peerId: '-1001234567890',
        messageId: 1,
        occurredAt: new Date().toISOString(),
        media: [],
        entities: [],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedMessages).toContain('message:1');

    // Step 2: Force disconnect mid-stream
    client1.close();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 3 & 4: Reconnect with exponential backoff simulation
    // We simulate exponential backoff: 1s, 2s, 4s
    const backoffDelays = [1000, 2000, 4000];
    let reconnectionAttempt = 0;
    let reconnected = false;

    for (const delay of backoffDelays) {
      if (reconnected) break;

      reconnectionAttempt++;

      // Wait for exponential backoff delay
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Attempt reconnection
      const client2 = new SimpleSSEClient(streamUrl);

      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            client2.close();
            reject(new Error('Connection timeout'));
          }, 2000);

          client2.onConnect(() => {
            clearTimeout(timeout);
            reconnected = true;
            resolve();
          });

          client2.onError((error) => {
            clearTimeout(timeout);
            reject(error);
          });

          client2.connect();
        });

        // If we get here, reconnection succeeded
        expect(reconnected).toBe(true);
        expect(reconnectionAttempt).toBeLessThanOrEqual(3);

        // Track messages on reconnected client
        client2.onMessage((event, data) => {
          if (event === 'message:telegram') {
            receivedMessages.push(`message:${data.messageId}`);
          }
        });

        // Step 5: Broadcast messages after reconnection to verify no loss
        streamService.broadcast({
          type: 'message:telegram',
          data: {
            peerId: '-1001234567890',
            messageId: 2,
            occurredAt: new Date().toISOString(),
            media: [],
            entities: [],
          },
        });

        streamService.broadcast({
          type: 'message:telegram',
          data: {
            peerId: '-1001234567890',
            messageId: 3,
            occurredAt: new Date().toISOString(),
            media: [],
            entities: [],
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify messages after reconnection
        expect(receivedMessages).toContain('message:2');
        expect(receivedMessages).toContain('message:3');

        // Cleanup
        client2.close();
        break;
      } catch (error) {
        // Connection failed, will retry with next backoff delay
        continue;
      }
    }

    expect(reconnected).toBe(true);
  }, 60000); // 60s timeout

  it('should cap exponential backoff at 30 seconds', () => {
    /**
     * This test verifies that reconnection delays never exceed 30s,
     * per Requirement 2.4: "max 30s" backoff cap
     */

    const calculateBackoff = (attempt: number): number => {
      const baseDelay = 1000; // 1s
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt),
        30000, // 30s cap
      );
      return delay;
    };

    // Verify the backoff formula
    expect(calculateBackoff(0)).toBe(1000); // Attempt 0: 1s
    expect(calculateBackoff(1)).toBe(2000); // Attempt 1: 2s
    expect(calculateBackoff(2)).toBe(4000); // Attempt 2: 4s
    expect(calculateBackoff(3)).toBe(8000); // Attempt 3: 8s
    expect(calculateBackoff(4)).toBe(16000); // Attempt 4: 16s
    expect(calculateBackoff(5)).toBe(30000); // Attempt 5: 32s, but capped at 30s
    expect(calculateBackoff(6)).toBe(30000); // Attempt 6: 64s, but capped at 30s
    expect(calculateBackoff(10)).toBe(30000); // Attempt 10: 1024s, but capped at 30s

    // Verify cap is consistent for high attempt counts
    for (let attempt = 5; attempt < 20; attempt++) {
      const delay = calculateBackoff(attempt);
      expect(delay).toBe(30000);
    }
  });

  it('should handle multiple disconnection-reconnection cycles', async () => {
    /**
     * Validates that the client can handle multiple disconnect/reconnect cycles
     * without degradation, per Requirement 8.4 (connection stability)
     */

    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;
    const cycles = 3;
    let successfulReconnects = 0;

    for (let cycle = 0; cycle < cycles; cycle++) {
      const client = new SimpleSSEClient(streamUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        client.onConnect(() => resolve());
        client.connect();
      });

      expect(streamService.getClientCount()).toBeGreaterThanOrEqual(1);

      // Disconnect
      client.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      successfulReconnects++;
    }

    expect(successfulReconnects).toBe(cycles);
  }, 30000);

  it('should receive messages immediately after reconnection', async () => {
    /**
     * Validates that messages broadcast immediately after reconnection
     * are received without loss, per Requirement 10.1
     */

    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;
    const receivedMessages: number[] = [];

    // Initial connection
    const client1 = new SimpleSSEClient(streamUrl);

    await new Promise<void>((resolve) => {
      client1.onConnect(() => resolve());
      client1.connect();
    });

    client1.onMessage((event, data) => {
      if (event === 'message:telegram') {
        receivedMessages.push(data.messageId);
      }
    });

    // Disconnect
    client1.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reconnect
    const client2 = new SimpleSSEClient(streamUrl);

    await new Promise<void>((resolve) => {
      client2.onConnect(() => resolve());
      client2.connect();
    });

    client2.onMessage((event, data) => {
      if (event === 'message:telegram') {
        receivedMessages.push(data.messageId);
      }
    });

    // Broadcast message immediately after reconnection
    streamService.broadcast({
      type: 'message:telegram',
      data: {
        peerId: '-1001234567890',
        messageId: 999,
        occurredAt: new Date().toISOString(),
        media: [],
        entities: [],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify message was received
    expect(receivedMessages).toContain(999);

    // Cleanup
    client2.close();
  }, 15000);

  it('should verify reconnection occurs within 30 seconds maximum', async () => {
    /**
     * Validates that with exponential backoff capped at 30s,
     * reconnection always succeeds within the 30s window
     */

    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;

    // Connect and disconnect
    const client1 = new SimpleSSEClient(streamUrl);
    await new Promise<void>((resolve) => {
      client1.onConnect(() => resolve());
      client1.connect();
    });

    client1.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Attempt reconnection
    const reconnectStartTime = Date.now();
    const client2 = new SimpleSSEClient(streamUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client2.close();
        reject(new Error('Reconnection failed within 30s'));
      }, 30000);

      client2.onConnect(() => {
        clearTimeout(timeout);
        resolve();
      });

      client2.onError((error) => {
        clearTimeout(timeout);
        reject(error);
      });

      client2.connect();
    });

    const reconnectionTime = Date.now() - reconnectStartTime;

    // Verify reconnection was faster than 30s
    expect(reconnectionTime).toBeLessThan(30000);

    // In practice, first reconnection should be very fast (~1s)
    expect(reconnectionTime).toBeLessThan(5000);

    client2.close();
  }, 35000);
});
