import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { StreamService } from '../src/stream/application/services/stream.service';
import * as http from 'http';
import { Registry } from 'prom-client';

/**
 * E2E Load Test: Concurrent SSE Clients
 *
 * Validates: Requirements 8.1, 8.2, 8.5
 *
 * This test validates the ingestion service's ability to handle concurrent load:
 * 1. Spawn 10 concurrent SSE clients (Requirement 8.2)
 * 2. Inject 100 messages per minute (Requirement 8.5)
 * 3. Measure broadcast latency (p50, p95, p99)
 * 4. Measure memory usage over 1 hour (scaled down to 5 minutes for test speed)
 * 5. Verify p95 latency <500ms (Requirement 8.1)
 * 6. Verify zero disconnections (Requirement 8.4)
 *
 * Per Requirement 8.1: "THE Ingestion_Service SHALL deliver the Message_Payload
 * to all connected clients within 500ms (p95)"
 *
 * Per Requirement 8.2: "THE Ingestion_Service SHALL support at least 10 concurrent
 * Client_Connections without performance degradation"
 *
 * Per Requirement 8.5: "WHEN message volume exceeds 100 messages per minute, THE
 * Ingestion_Service SHALL NOT drop messages or miss broadcasts"
 */
describe('Load Test: Concurrent SSE Clients (e2e)', () => {
  let app: INestApplication;
  let streamService: StreamService;
  let serverPort: number;

  /**
   * Latency measurement data structure
   */
  interface LatencyMeasurement {
    messageId: number;
    broadcastTime: number;
    receiveTime: number;
    latency: number;
  }

  /**
   * Simple SSE client implementation for load testing
   */
  class LoadTestSSEClient {
    private request: http.ClientRequest | null = null;
    private connected = false;
    private events: Array<{ event: string; data: any; timestamp: number }> = [];
    private disconnectCount = 0;
    private onConnectCallbacks: Array<() => void> = [];
    private onMessageCallbacks: Array<
      (event: string, data: any, timestamp: number) => void
    > = [];
    private onDisconnectCallbacks: Array<() => void> = [];

    constructor(
      private url: string,
      private clientId: string,
    ) {}

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
              const timestamp = Date.now();

              this.events.push({ event, data, timestamp });
              this.onMessageCallbacks.forEach((cb) =>
                cb(event, data, timestamp),
              );
            }
          }
        });

        response.on('end', () => {
          this.connected = false;
          this.disconnectCount++;
          this.onDisconnectCallbacks.forEach((cb) => cb());
        });

        response.on('error', () => {
          this.connected = false;
          this.disconnectCount++;
          this.onDisconnectCallbacks.forEach((cb) => cb());
        });
      });

      this.request.on('error', () => {
        this.connected = false;
        this.disconnectCount++;
        this.onDisconnectCallbacks.forEach((cb) => cb());
      });

      this.request.end();
    }

    onConnect(callback: () => void): void {
      this.onConnectCallbacks.push(callback);
    }

    onMessage(
      callback: (event: string, data: any, timestamp: number) => void,
    ): void {
      this.onMessageCallbacks.push(callback);
    }

    onDisconnect(callback: () => void): void {
      this.onDisconnectCallbacks.push(callback);
    }

    getEvents(): Array<{ event: string; data: any; timestamp: number }> {
      return this.events;
    }

    isConnected(): boolean {
      return this.connected;
    }

    getDisconnectCount(): number {
      return this.disconnectCount;
    }

    getClientId(): string {
      return this.clientId;
    }

    close(): void {
      if (this.request) {
        this.request.destroy();
        this.request = null;
      }
      this.connected = false;
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  function calculatePercentile(
    sortedArray: number[],
    percentile: number,
  ): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Calculate latency statistics
   */
  function calculateLatencyStats(measurements: LatencyMeasurement[]) {
    const latencies = measurements.map((m) => m.latency).sort((a, b) => a - b);

    return {
      p50: calculatePercentile(latencies, 50),
      p95: calculatePercentile(latencies, 95),
      p99: calculatePercentile(latencies, 99),
      min: latencies[0] || 0,
      max: latencies[latencies.length - 1] || 0,
      avg: latencies.reduce((sum, val) => sum + val, 0) / latencies.length || 0,
      count: latencies.length,
    };
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

  it('should handle 10 concurrent clients with 100 messages/min load', async () => {
    /**
     * Main load test scenario:
     * - Spawn 10 SSE clients
     * - Inject 100 messages/min (1.67 msgs/sec) for 5 minutes (500 total messages)
     * - Measure latency for each message delivery
     * - Verify p95 latency <500ms
     * - Verify zero disconnections
     */

    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;
    const clientCount = 10;
    const messagesPerMinute = 100;
    const testDurationMinutes = 5; // Scaled down from 60min for test speed
    const totalMessages = messagesPerMinute * testDurationMinutes;
    const messageIntervalMs = (60 * 1000) / messagesPerMinute; // ~600ms between messages

    console.log('\n=== Load Test Configuration ===');
    console.log(`Concurrent clients: ${clientCount}`);
    console.log(`Messages per minute: ${messagesPerMinute}`);
    console.log(`Test duration: ${testDurationMinutes} minutes`);
    console.log(`Total messages: ${totalMessages}`);
    console.log(`Message interval: ${messageIntervalMs.toFixed(0)}ms`);
    console.log('================================\n');

    // Step 1: Spawn 10 concurrent SSE clients
    const clients: LoadTestSSEClient[] = [];
    const clientLatencies: Map<string, LatencyMeasurement[]> = new Map();

    console.log('Spawning clients...');
    for (let i = 0; i < clientCount; i++) {
      const clientId = `load-test-client-${i}`;
      const client = new LoadTestSSEClient(streamUrl, clientId);
      clientLatencies.set(clientId, []);

      // Track message latencies
      client.onMessage((event, data, receiveTime) => {
        if (event === 'message:telegram' && data.broadcastTime) {
          const measurement: LatencyMeasurement = {
            messageId: data.messageId,
            broadcastTime: data.broadcastTime,
            receiveTime,
            latency: receiveTime - data.broadcastTime,
          };
          clientLatencies.get(clientId)?.push(measurement);
        }
      });

      clients.push(client);
    }

    // Connect all clients
    await Promise.all(
      clients.map(
        (client) =>
          new Promise<void>((resolve) => {
            client.onConnect(() => resolve());
            client.connect();
          }),
      ),
    );

    console.log(`All ${clientCount} clients connected`);
    expect(streamService.getClientCount()).toBe(clientCount);

    // Step 2: Inject messages at 100/min rate
    console.log(`\nStarting message injection (${totalMessages} messages)...`);
    const startTime = Date.now();
    const memoryMeasurements: Array<{
      timestamp: number;
      heapUsed: number;
      heapTotal: number;
    }> = [];

    // Measure initial memory
    const initialMemory = process.memoryUsage();
    memoryMeasurements.push({
      timestamp: Date.now(),
      heapUsed: initialMemory.heapUsed,
      heapTotal: initialMemory.heapTotal,
    });

    let messagesSent = 0;

    // Message injection loop
    const messageInterval = setInterval(() => {
      if (messagesSent >= totalMessages) {
        clearInterval(messageInterval);
        return;
      }

      const messageId = messagesSent + 1;
      const broadcastTime = Date.now();

      // Broadcast message with embedded timestamp for latency measurement
      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: '-1001234567890',
          messageId,
          occurredAt: new Date().toISOString(),
          broadcastTime, // Embedded timestamp for latency calculation
          media: [],
          entities: [],
        },
      });

      messagesSent++;

      // Log progress every 100 messages
      if (messagesSent % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `  Sent ${messagesSent}/${totalMessages} messages (${elapsed}s elapsed)`,
        );

        // Measure memory every 100 messages
        const currentMemory = process.memoryUsage();
        memoryMeasurements.push({
          timestamp: Date.now(),
          heapUsed: currentMemory.heapUsed,
          heapTotal: currentMemory.heapTotal,
        });
      }
    }, messageIntervalMs);

    // Wait for all messages to be sent + 2s buffer for last messages to propagate
    await new Promise((resolve) =>
      setTimeout(resolve, totalMessages * messageIntervalMs + 2000),
    );

    const endTime = Date.now();
    const testDurationSeconds = (endTime - startTime) / 1000;

    console.log(
      `\nMessage injection complete (${testDurationSeconds.toFixed(1)}s total)`,
    );

    // Step 3: Calculate aggregate latency statistics
    console.log('\n=== Latency Analysis ===');

    const allLatencies: LatencyMeasurement[] = [];
    for (const [clientId, measurements] of clientLatencies) {
      allLatencies.push(...measurements);
      const stats = calculateLatencyStats(measurements);
      console.log(`Client ${clientId}:`);
      console.log(`  Messages received: ${measurements.length}`);
      console.log(`  Latency p50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  Latency p95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  Latency p99: ${stats.p99.toFixed(2)}ms`);
    }

    const aggregateStats = calculateLatencyStats(allLatencies);
    console.log('\nAggregate Statistics:');
    console.log(`  Total measurements: ${aggregateStats.count}`);
    console.log(`  Latency p50: ${aggregateStats.p50.toFixed(2)}ms`);
    console.log(`  Latency p95: ${aggregateStats.p95.toFixed(2)}ms`);
    console.log(`  Latency p99: ${aggregateStats.p99.toFixed(2)}ms`);
    console.log(`  Latency min: ${aggregateStats.min.toFixed(2)}ms`);
    console.log(`  Latency max: ${aggregateStats.max.toFixed(2)}ms`);
    console.log(`  Latency avg: ${aggregateStats.avg.toFixed(2)}ms`);

    // Step 4: Verify p95 latency <500ms (Requirement 8.1)
    expect(aggregateStats.p95).toBeLessThan(500);
    console.log(
      `\n✓ p95 latency ${aggregateStats.p95.toFixed(2)}ms < 500ms requirement`,
    );

    // Step 5: Verify zero disconnections (Requirement 8.4)
    console.log('\n=== Connection Stability ===');
    let totalDisconnections = 0;
    for (const client of clients) {
      const disconnects = client.getDisconnectCount();
      totalDisconnections += disconnects;
      console.log(
        `Client ${client.getClientId()}: ${disconnects} disconnections`,
      );
    }

    expect(totalDisconnections).toBe(0);
    console.log(`✓ Zero disconnections across ${clientCount} clients`);

    // Step 6: Verify all clients are still connected
    const connectedCount = clients.filter((c) => c.isConnected()).length;
    expect(connectedCount).toBe(clientCount);
    console.log(`✓ All ${clientCount} clients still connected`);

    // Step 7: Verify no message loss
    console.log('\n=== Message Delivery ===');
    for (const [clientId, measurements] of clientLatencies) {
      const receivedCount = measurements.length;
      const expectedCount = totalMessages;
      const deliveryRate = ((receivedCount / expectedCount) * 100).toFixed(2);
      console.log(
        `Client ${clientId}: ${receivedCount}/${expectedCount} (${deliveryRate}%)`,
      );
      expect(receivedCount).toBe(expectedCount);
    }
    console.log(
      `✓ All ${totalMessages} messages delivered to all ${clientCount} clients`,
    );

    // Step 8: Memory usage analysis
    console.log('\n=== Memory Usage ===');
    const initialHeapMB = (
      memoryMeasurements[0].heapUsed /
      1024 /
      1024
    ).toFixed(2);
    const finalHeapMB = (
      memoryMeasurements[memoryMeasurements.length - 1].heapUsed /
      1024 /
      1024
    ).toFixed(2);
    const heapGrowthMB = (
      parseFloat(finalHeapMB) - parseFloat(initialHeapMB)
    ).toFixed(2);

    console.log(`Initial heap usage: ${initialHeapMB} MB`);
    console.log(`Final heap usage: ${finalHeapMB} MB`);
    console.log(`Heap growth: ${heapGrowthMB} MB`);

    // Memory should remain reasonable (not grow excessively)
    // For 500 messages * 10 clients = 5000 events, expect <50MB growth
    expect(parseFloat(heapGrowthMB)).toBeLessThan(50);
    console.log(`✓ Memory growth ${heapGrowthMB} MB < 50 MB threshold`);

    // Step 9: Cleanup
    console.log('\n=== Cleanup ===');
    for (const client of clients) {
      client.close();
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(streamService.getClientCount()).toBe(0);
    console.log('✓ All clients disconnected cleanly');

    console.log('\n=== Load Test Summary ===');
    console.log(`✓ Handled ${clientCount} concurrent clients`);
    console.log(
      `✓ Processed ${totalMessages} messages at ${messagesPerMinute}/min rate`,
    );
    console.log(
      `✓ p95 latency: ${aggregateStats.p95.toFixed(2)}ms (< 500ms requirement)`,
    );
    console.log(`✓ Zero disconnections`);
    console.log(`✓ 100% message delivery rate`);
    console.log(`✓ Memory growth: ${heapGrowthMB} MB`);
    console.log('=========================\n');
  }, 400000); // 6min 40s timeout (5min test + 1min 40s buffer)

  it('should verify no performance degradation with client count scaling', async () => {
    /**
     * Validates that latency remains stable as client count increases
     * from 1 → 5 → 10 clients (Per Requirement 8.2)
     */

    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;
    const testCases = [
      { clients: 1, messages: 50 },
      { clients: 5, messages: 50 },
      { clients: 10, messages: 50 },
    ];

    console.log('\n=== Scalability Test ===');

    const results: Array<{ clientCount: number; p95Latency: number }> = [];

    for (const testCase of testCases) {
      const clients: LoadTestSSEClient[] = [];
      const latencies: LatencyMeasurement[] = [];

      // Spawn clients
      for (let i = 0; i < testCase.clients; i++) {
        const client = new LoadTestSSEClient(
          streamUrl,
          `scale-test-client-${i}`,
        );

        client.onMessage((event, data, receiveTime) => {
          if (event === 'message:telegram' && data.broadcastTime) {
            latencies.push({
              messageId: data.messageId,
              broadcastTime: data.broadcastTime,
              receiveTime,
              latency: receiveTime - data.broadcastTime,
            });
          }
        });

        clients.push(client);
      }

      // Connect all clients
      await Promise.all(
        clients.map(
          (client) =>
            new Promise<void>((resolve) => {
              client.onConnect(() => resolve());
              client.connect();
            }),
        ),
      );

      // Inject messages
      for (let i = 0; i < testCase.messages; i++) {
        streamService.broadcast({
          type: 'message:telegram',
          data: {
            peerId: '-1001234567890',
            messageId: i + 1,
            occurredAt: new Date().toISOString(),
            broadcastTime: Date.now(),
            media: [],
            entities: [],
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms between messages
      }

      // Wait for propagation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Calculate stats
      const stats = calculateLatencyStats(latencies);
      results.push({ clientCount: testCase.clients, p95Latency: stats.p95 });

      console.log(
        `${testCase.clients} clients: p95 latency ${stats.p95.toFixed(2)}ms`,
      );

      // Cleanup
      for (const client of clients) {
        client.close();
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Verify p95 latency remains <500ms at all scales
    for (const result of results) {
      expect(result.p95Latency).toBeLessThan(500);
    }

    // Verify no significant degradation (p95 should not increase >2x from 1 to 10 clients)
    const latency1Client = results[0].p95Latency;
    const latency10Clients = results[2].p95Latency;
    const degradationFactor = latency10Clients / latency1Client;

    console.log(
      `\nDegradation factor (10 clients / 1 client): ${degradationFactor.toFixed(2)}x`,
    );
    expect(degradationFactor).toBeLessThan(2.0);

    console.log('✓ No performance degradation with scaling');
    console.log('========================\n');
  }, 120000); // 2min timeout

  it('should handle burst traffic without message loss', async () => {
    /**
     * Validates that the service can handle sudden bursts of messages
     * without dropping any broadcasts (Per Requirement 8.5)
     */

    const streamUrl = `http://localhost:${serverPort}/api/ingestion/stream`;
    const clientCount = 10;
    const burstSize = 50; // 50 messages in rapid succession
    const burstIntervalMs = 10; // 10ms between messages in burst

    console.log('\n=== Burst Traffic Test ===');
    console.log(`Clients: ${clientCount}`);
    console.log(`Burst size: ${burstSize} messages`);
    console.log(`Burst interval: ${burstIntervalMs}ms`);

    // Spawn clients
    const clients: LoadTestSSEClient[] = [];
    const receivedCounts: Map<string, Set<number>> = new Map();

    for (let i = 0; i < clientCount; i++) {
      const clientId = `burst-test-client-${i}`;
      const client = new LoadTestSSEClient(streamUrl, clientId);
      receivedCounts.set(clientId, new Set());

      client.onMessage((event, data) => {
        if (event === 'message:telegram') {
          receivedCounts.get(clientId)?.add(data.messageId);
        }
      });

      clients.push(client);
    }

    // Connect all clients
    await Promise.all(
      clients.map(
        (client) =>
          new Promise<void>((resolve) => {
            client.onConnect(() => resolve());
            client.connect();
          }),
      ),
    );

    // Send burst of messages
    console.log('Sending burst...');
    for (let i = 0; i < burstSize; i++) {
      streamService.broadcast({
        type: 'message:telegram',
        data: {
          peerId: '-1001234567890',
          messageId: i + 1,
          occurredAt: new Date().toISOString(),
          media: [],
          entities: [],
        },
      });

      await new Promise((resolve) => setTimeout(resolve, burstIntervalMs));
    }

    // Wait for propagation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify all clients received all messages
    console.log('\nMessage reception:');
    for (const [clientId, messageIds] of receivedCounts) {
      const receivedCount = messageIds.size;
      console.log(`${clientId}: ${receivedCount}/${burstSize} messages`);
      expect(receivedCount).toBe(burstSize);
    }

    console.log(
      `✓ All ${clientCount} clients received all ${burstSize} messages`,
    );

    // Cleanup
    for (const client of clients) {
      client.close();
    }

    console.log('========================\n');
  }, 60000); // 1min timeout
});
