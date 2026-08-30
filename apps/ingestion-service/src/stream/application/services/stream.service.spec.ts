import { Test, TestingModule } from '@nestjs/testing';
import { StreamService, SSEEvent } from './stream.service';
import { DisconnectionTracker } from './disconnection-tracker.service';
import { ServerResponse } from 'http';

/**
 * Mock ServerResponse implementation for testing
 */
class MockResponse {
  public writableEnded = false;
  public headers: Record<string, string> = {};
  public statusCode: number = 0;
  public writes: string[] = [];

  writeHead(statusCode: number, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  write(data: string): boolean {
    if (this.writableEnded) {
      throw new Error('Response already ended');
    }
    this.writes.push(data);
    return true;
  }

  end(): void {
    this.writableEnded = true;
  }

  getWrittenData(): string[] {
    return this.writes;
  }

  reset(): void {
    this.writes = [];
    this.writableEnded = false;
    this.headers = {};
    this.statusCode = 0;
  }
}

describe('StreamService', () => {
  let service: StreamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StreamService, DisconnectionTracker],
    }).compile();

    service = module.get<StreamService>(StreamService);
  });

  afterEach(() => {
    // Clean up all clients after each test
    service.shutdown();
  });

  describe('addClient', () => {
    it('should register a new client with correct SSE headers', () => {
      // Arrange
      const clientId = 'test-client-1';
      const mockResponse = new MockResponse() as unknown as ServerResponse;

      // Act
      service.addClient(clientId, mockResponse);

      // Assert
      expect((mockResponse as unknown as MockResponse).statusCode).toBe(200);
      expect((mockResponse as unknown as MockResponse).headers).toEqual({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    });

    it('should send connection:established event on client registration', () => {
      // Arrange
      const clientId = 'test-client-2';
      const mockResponse = new MockResponse() as unknown as ServerResponse;

      // Act
      service.addClient(clientId, mockResponse);

      // Assert
      const writes = (mockResponse as unknown as MockResponse).getWrittenData();
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain('event: connection:established');
      expect(writes[0]).toContain(`"clientId":"${clientId}"`);
      expect(writes[0]).toContain(
        '"message":"Connected to Ingestion Service SSE stream"',
      );
    });

    it('should increment client count when adding clients', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      // Act
      service.addClient('client-1', mockResponse1);
      expect(service.getClientCount()).toBe(1);

      service.addClient('client-2', mockResponse2);
      expect(service.getClientCount()).toBe(2);
    });

    it('should handle multiple clients with unique IDs', () => {
      // Arrange
      const clients = ['client-a', 'client-b', 'client-c'];
      const mockResponses = clients.map(
        () => new MockResponse() as unknown as ServerResponse,
      );

      // Act
      clients.forEach((clientId, index) => {
        service.addClient(clientId, mockResponses[index]);
      });

      // Assert
      expect(service.getClientCount()).toBe(3);
      const connectedClients = service.getConnectedClients();
      expect(connectedClients).toHaveLength(3);
      expect(connectedClients.map((c) => c.id)).toEqual(clients);
    });
  });

  describe('removeClient', () => {
    it('should remove a client and close the response', () => {
      // Arrange
      const clientId = 'test-client-remove';
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient(clientId, mockResponse);

      expect(service.getClientCount()).toBe(1);

      // Act
      service.removeClient(clientId);

      // Assert
      expect(service.getClientCount()).toBe(0);
      expect((mockResponse as unknown as MockResponse).writableEnded).toBe(
        true,
      );
    });

    it('should handle removing non-existent client gracefully', () => {
      // Act & Assert - should not throw
      expect(() => service.removeClient('non-existent-client')).not.toThrow();
      expect(service.getClientCount()).toBe(0);
    });

    it('should handle response already ended', () => {
      // Arrange
      const clientId = 'test-client-ended';
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient(clientId, mockResponse);
      (mockResponse as unknown as MockResponse).end();

      // Act & Assert - should not throw
      expect(() => service.removeClient(clientId)).not.toThrow();
      expect(service.getClientCount()).toBe(0);
    });

    it('should decrement client count after removal', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;
      service.addClient('client-1', mockResponse1);
      service.addClient('client-2', mockResponse2);

      expect(service.getClientCount()).toBe(2);

      // Act
      service.removeClient('client-1');

      // Assert
      expect(service.getClientCount()).toBe(1);
    });
  });

  describe('broadcast', () => {
    it('should send event to all connected clients', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;
      const mockResponse3 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-1', mockResponse1);
      service.addClient('client-2', mockResponse2);
      service.addClient('client-3', mockResponse3);

      const event: SSEEvent = {
        type: 'test:event',
        data: { message: 'Hello, World!', timestamp: Date.now() },
      };

      // Act
      service.broadcast(event);

      // Assert
      [mockResponse1, mockResponse2, mockResponse3].forEach((response) => {
        const writes = (response as unknown as MockResponse).getWrittenData();
        // Should have 2 writes: 1 connection:established, 1 broadcast
        expect(writes.length).toBeGreaterThanOrEqual(2);

        const lastWrite = writes[writes.length - 1];
        expect(lastWrite).toContain('event: test:event');
        expect(lastWrite).toContain('"message":"Hello, World!"');
      });
    });

    it('should format SSE events correctly per EventSource spec', () => {
      // Arrange
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient('client-test', mockResponse);

      const event: SSEEvent = {
        type: 'message:ingested',
        data: { channelId: '123', messageId: 456 },
      };

      // Act
      service.broadcast(event);

      // Assert
      const writes = (mockResponse as unknown as MockResponse).getWrittenData();
      const broadcastWrite = writes[writes.length - 1];

      // Per EventSource spec: event: <type>\ndata: <json>\n\n
      expect(broadcastWrite).toMatch(/^event: message:ingested\n/);
      expect(broadcastWrite).toMatch(/data: \{.*\}\n\n$/);
      expect(broadcastWrite).toContain('"channelId":"123"');
      expect(broadcastWrite).toContain('"messageId":456');
    });

    it('should remove dead clients during broadcast', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-alive', mockResponse1);
      service.addClient('client-dead', mockResponse2);

      // Simulate dead connection
      (mockResponse2 as unknown as MockResponse).writableEnded = true;

      expect(service.getClientCount()).toBe(2);

      const event: SSEEvent = {
        type: 'test:cleanup',
        data: { test: true },
      };

      // Act
      service.broadcast(event);

      // Assert
      expect(service.getClientCount()).toBe(1);
      const connectedClients = service.getConnectedClients();
      expect(connectedClients[0].id).toBe('client-alive');
    });

    it('should handle broadcast with no connected clients', () => {
      // Arrange
      const event: SSEEvent = {
        type: 'test:empty',
        data: { message: 'No one listening' },
      };

      // Act & Assert - should not throw
      expect(() => service.broadcast(event)).not.toThrow();
    });

    it('should handle write errors and clean up failed clients', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-ok', mockResponse1);
      service.addClient('client-error', mockResponse2);

      // Override write to throw error for client-error
      (mockResponse2 as unknown as MockResponse).write = () => {
        throw new Error('Write failed');
      };

      const event: SSEEvent = {
        type: 'test:error',
        data: { test: true },
      };

      // Act
      service.broadcast(event);

      // Assert
      expect(service.getClientCount()).toBe(1);
      expect(service.getConnectedClients()[0].id).toBe('client-ok');
    });
  });

  describe('getClientCount', () => {
    it('should return 0 when no clients are connected', () => {
      expect(service.getClientCount()).toBe(0);
    });

    it('should return correct count after adding clients', () => {
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-1', mockResponse1);
      expect(service.getClientCount()).toBe(1);

      service.addClient('client-2', mockResponse2);
      expect(service.getClientCount()).toBe(2);
    });

    it('should return correct count after removing clients', () => {
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-1', mockResponse1);
      service.addClient('client-2', mockResponse2);

      expect(service.getClientCount()).toBe(2);

      service.removeClient('client-1');
      expect(service.getClientCount()).toBe(1);

      service.removeClient('client-2');
      expect(service.getClientCount()).toBe(0);
    });
  });

  describe('getConnectedClients', () => {
    it('should return empty array when no clients connected', () => {
      const clients = service.getConnectedClients();
      expect(clients).toEqual([]);
    });

    it('should return client metadata without response objects', () => {
      // Arrange
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient('test-client', mockResponse);

      // Act
      const clients = service.getConnectedClients();

      // Assert
      expect(clients).toHaveLength(1);
      expect(clients[0]).toHaveProperty('id', 'test-client');
      expect(clients[0]).toHaveProperty('connectedAt');
      expect(clients[0].connectedAt).toBeInstanceOf(Date);
      expect(clients[0]).not.toHaveProperty('response');
    });

    it('should return all connected clients with timestamps', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-a', mockResponse1);
      service.addClient('client-b', mockResponse2);

      // Act
      const clients = service.getConnectedClients();

      // Assert
      expect(clients).toHaveLength(2);
      expect(clients.map((c) => c.id)).toEqual(['client-a', 'client-b']);
      clients.forEach((client) => {
        expect(client.connectedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('sendHeartbeat', () => {
    it('should broadcast health:ping event to all clients', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-1', mockResponse1);
      service.addClient('client-2', mockResponse2);

      // Act
      service.sendHeartbeat();

      // Assert
      [mockResponse1, mockResponse2].forEach((response) => {
        const writes = (response as unknown as MockResponse).getWrittenData();
        const heartbeatWrite = writes[writes.length - 1];

        expect(heartbeatWrite).toContain('event: health:ping');
        expect(heartbeatWrite).toContain('"timestamp"');
        expect(heartbeatWrite).toContain('"uptime"');
        expect(heartbeatWrite).toContain('"connectedClients":2');
      });
    });

    it('should include correct client count in heartbeat', () => {
      // Arrange
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient('client-solo', mockResponse);

      // Act
      service.sendHeartbeat();

      // Assert
      const writes = (mockResponse as unknown as MockResponse).getWrittenData();
      const heartbeatWrite = writes[writes.length - 1];
      expect(heartbeatWrite).toContain('"connectedClients":1');
    });
  });

  describe('shutdown', () => {
    it('should close all client connections', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;
      const mockResponse3 = new MockResponse() as unknown as ServerResponse;

      service.addClient('client-1', mockResponse1);
      service.addClient('client-2', mockResponse2);
      service.addClient('client-3', mockResponse3);

      expect(service.getClientCount()).toBe(3);

      // Act
      service.shutdown();

      // Assert
      expect(service.getClientCount()).toBe(0);
      [mockResponse1, mockResponse2, mockResponse3].forEach((response) => {
        expect((response as unknown as MockResponse).writableEnded).toBe(true);
      });
    });

    it('should handle shutdown with no clients', () => {
      // Act & Assert - should not throw
      expect(() => service.shutdown()).not.toThrow();
      expect(service.getClientCount()).toBe(0);
    });
  });

  describe('concurrent client handling', () => {
    it('should handle rapid client additions and removals', () => {
      // Arrange
      const clientCount = 20;
      const mockResponses = Array.from(
        { length: clientCount },
        () => new MockResponse() as unknown as ServerResponse,
      );

      // Act - Add all clients
      for (let i = 0; i < clientCount; i++) {
        service.addClient(`client-${i}`, mockResponses[i]);
      }

      // Assert
      expect(service.getClientCount()).toBe(clientCount);

      // Act - Remove half the clients
      for (let i = 0; i < clientCount / 2; i++) {
        service.removeClient(`client-${i}`);
      }

      // Assert
      expect(service.getClientCount()).toBe(clientCount / 2);
    });

    it('should broadcast to many clients without data loss', () => {
      // Arrange
      const clientCount = 50;
      const mockResponses = Array.from(
        { length: clientCount },
        () => new MockResponse() as unknown as ServerResponse,
      );

      for (let i = 0; i < clientCount; i++) {
        service.addClient(`client-${i}`, mockResponses[i]);
      }

      const event: SSEEvent = {
        type: 'stress:test',
        data: { messageId: 12345, test: true },
      };

      // Act
      service.broadcast(event);

      // Assert - All clients should receive the message
      mockResponses.forEach((response) => {
        const writes = (response as unknown as MockResponse).getWrittenData();
        const lastWrite = writes[writes.length - 1];
        expect(lastWrite).toContain('event: stress:test');
        expect(lastWrite).toContain('"messageId":12345');
      });
    });

    it('should handle interleaved add/remove/broadcast operations', () => {
      // Arrange
      const mockResponse1 = new MockResponse() as unknown as ServerResponse;
      const mockResponse2 = new MockResponse() as unknown as ServerResponse;
      const mockResponse3 = new MockResponse() as unknown as ServerResponse;

      const event1: SSEEvent = { type: 'test:1', data: { seq: 1 } };
      const event2: SSEEvent = { type: 'test:2', data: { seq: 2 } };
      const event3: SSEEvent = { type: 'test:3', data: { seq: 3 } };

      // Act - Complex interleaving
      service.addClient('client-1', mockResponse1);
      service.broadcast(event1);

      service.addClient('client-2', mockResponse2);
      service.broadcast(event2);

      service.removeClient('client-1');
      service.addClient('client-3', mockResponse3);
      service.broadcast(event3);

      // Assert
      expect(service.getClientCount()).toBe(2);

      // client-1 should have events 1 and 2 (removed before event 3)
      const writes1 = (
        mockResponse1 as unknown as MockResponse
      ).getWrittenData();
      expect(writes1.some((w) => w.includes('test:1'))).toBe(true);
      expect(writes1.some((w) => w.includes('test:2'))).toBe(true);
      expect(writes1.some((w) => w.includes('test:3'))).toBe(false);

      // client-2 should have events 2 and 3 (added before event 2)
      const writes2 = (
        mockResponse2 as unknown as MockResponse
      ).getWrittenData();
      expect(writes2.some((w) => w.includes('test:1'))).toBe(false);
      expect(writes2.some((w) => w.includes('test:2'))).toBe(true);
      expect(writes2.some((w) => w.includes('test:3'))).toBe(true);

      // client-3 should only have event 3 (added before event 3)
      const writes3 = (
        mockResponse3 as unknown as MockResponse
      ).getWrittenData();
      expect(writes3.some((w) => w.includes('test:1'))).toBe(false);
      expect(writes3.some((w) => w.includes('test:2'))).toBe(false);
      expect(writes3.some((w) => w.includes('test:3'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle events with complex nested data structures', () => {
      // Arrange
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient('client-complex', mockResponse);

      const complexEvent: SSEEvent = {
        type: 'message:ingested',
        data: {
          channelId: '123456789',
          messageId: 999,
          media: [
            { type: 'photo', url: 'http://example.com/photo1.jpg' },
            { type: 'photo', url: 'http://example.com/photo2.jpg' },
          ],
          entities: [
            { type: 'mention', offset: 0, length: 10, userId: '11111' },
          ],
          metadata: {
            timestamp: new Date().toISOString(),
            groupedId: 'group-xyz',
          },
        },
      };

      // Act
      service.broadcast(complexEvent);

      // Assert
      const writes = (mockResponse as unknown as MockResponse).getWrittenData();
      const eventWrite = writes[writes.length - 1];

      expect(eventWrite).toContain('event: message:ingested');
      expect(eventWrite).toContain('"channelId":"123456789"');
      expect(eventWrite).toContain('"media":[');
      expect(eventWrite).toContain('"entities":[');
      expect(eventWrite).toContain('"groupedId":"group-xyz"');
    });

    it('should handle empty data payloads', () => {
      // Arrange
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient('client-empty', mockResponse);

      const emptyEvent: SSEEvent = {
        type: 'test:empty',
        data: {},
      };

      // Act & Assert
      expect(() => service.broadcast(emptyEvent)).not.toThrow();

      const writes = (mockResponse as unknown as MockResponse).getWrittenData();
      const eventWrite = writes[writes.length - 1];
      expect(eventWrite).toContain('event: test:empty');
      expect(eventWrite).toContain('data: {}');
    });

    it('should handle special characters in event data', () => {
      // Arrange
      const mockResponse = new MockResponse() as unknown as ServerResponse;
      service.addClient('client-special', mockResponse);

      const specialEvent: SSEEvent = {
        type: 'test:special',
        data: {
          message: 'Line1\nLine2\tTabbed "Quoted" \'Single\' \\Escaped\\',
          emoji: '🚀💰📈',
        },
      };

      // Act
      service.broadcast(specialEvent);

      // Assert
      const writes = (mockResponse as unknown as MockResponse).getWrittenData();
      const eventWrite = writes[writes.length - 1];

      // JSON.stringify should escape special characters properly
      expect(eventWrite).toContain('event: test:special');
      expect(eventWrite).toContain('\\n'); // Newline escaped
      expect(eventWrite).toContain('\\t'); // Tab escaped
      expect(eventWrite).toContain('🚀💰📈'); // Unicode preserved
    });
  });
});
