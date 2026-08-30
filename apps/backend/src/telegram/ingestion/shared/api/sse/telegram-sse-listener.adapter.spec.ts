import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { TelegramSseListenerAdapter } from './telegram-sse-listener.adapter';
import { TelegramRawMessage } from '../../domain/ports/telegram-listener.port';

/**
 * Unit tests for TelegramSseListenerAdapter
 * 
 * Per Task 6.4: Tests for subscribe(), payloadToRawMessage(), 
 * calculateBackoff(), parseSSE(), backfill()
 * 
 * Requirements tested:
 * - 3.2: SSE connection establishment
 * - 3.3: Interface compatibility (TelegramListenerPort)
 * - GAP 1: Backfill endpoint with SSE
 */
describe('TelegramSseListenerAdapter', () => {
  let adapter: TelegramSseListenerAdapter;
  let configService: jest.Mocked<ConfigService>;
  let logger: jest.Mocked<Logger>;

  const mockFetch = jest.fn();

  beforeAll(() => {
    global.fetch = mockFetch as any;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create explicit mock logger
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      fatal: jest.fn(),
      setLogLevels: jest.fn(),
      localInstance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramSseListenerAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app') {
                return {
                  ingestion: {
                    serviceUrl: 'http://localhost:3031',
                  },
                };
              }
              return undefined;
            }),
          },
        },
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    adapter = module.get<TelegramSseListenerAdapter>(TelegramSseListenerAdapter);
    configService = module.get(ConfigService);
    logger = module.get(Logger);
    
    // Override the adapter's logger instance with our mock
    (adapter as any).logger = mockLogger;
  });

  afterEach(async () => {
    await adapter.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('subscribe()', () => {
    it('should yield TelegramRawMessage objects from SSE stream', async () => {
      const channelIds = ['-1001234567890'];
      
      // Mock SSE response body
      const ssePayload = `event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345,"occurredAt":"2026-08-30T00:01:00Z","media":[{"type":"photo","index":0,"url":"http://localhost:3031/api/media/-1001234567890/12345/0","mimeType":"image/jpeg","fileSize":245678}],"entities":[],"messageType":"kol"}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      // Use a helper to collect first message and then abort
      const messages: TelegramRawMessage[] = [];
      const generator = adapter.subscribe(channelIds);

      for await (const message of generator) {
        messages.push(message);
        break; // Take only first message
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        peerId: '-1001234567890',
        messageId: 12345,
        text: '', // Per Invariant 1: text not in SSE payload
        media: [
          {
            type: 'photo',
            index: 0,
            filePath: 'http://localhost:3031/api/media/-1001234567890/12345/0',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
        ],
      });
      expect(messages[0].occurredAt).toEqual(new Date('2026-08-30T00:01:00Z'));
    });

    it('should filter messages by subscribed channelIds', async () => {
      const channelIds = ['-1001234567890'];
      
      const ssePayload = `event: message:telegram
data: {"peerId":"-1009876543210","messageId":12345,"occurredAt":"2026-08-30T00:01:00Z","media":[],"entities":[],"messageType":"kol"}

event: message:telegram
data: {"peerId":"-1001234567890","messageId":12346,"occurredAt":"2026-08-30T00:02:00Z","media":[],"entities":[],"messageType":"kol"}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const messages: TelegramRawMessage[] = [];
      const generator = adapter.subscribe(channelIds);

      for await (const message of generator) {
        messages.push(message);
        if (messages.length >= 1) break;
      }

      // Only message with peerId in channelIds should be yielded
      expect(messages).toHaveLength(1);
      expect(messages[0].peerId).toBe('-1001234567890');
      expect(messages[0].messageId).toBe(12346);
    });

    it('should handle heartbeat events without yielding messages', async () => {
      const channelIds = ['-1001234567890'];
      
      const ssePayload = `event: health:ping
data: {"timestamp":"2026-08-30T00:02:00Z","uptime":120000}

event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345,"occurredAt":"2026-08-30T00:01:00Z","media":[],"entities":[],"messageType":"kol"}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const messages: TelegramRawMessage[] = [];
      const generator = adapter.subscribe(channelIds);

      for await (const message of generator) {
        messages.push(message);
        break;
      }

      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe(12345);
      expect(logger.debug).toHaveBeenCalledWith('SSE heartbeat received');
    });

    it('should reconnect on connection failure with exponential backoff', async () => {
      const channelIds = ['-1001234567890'];
      
      // First attempt fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      // Second attempt succeeds
      const ssePayload = `event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345,"occurredAt":"2026-08-30T00:01:00Z","media":[],"entities":[],"messageType":"kol"}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const messages: TelegramRawMessage[] = [];
      const generator = adapter.subscribe(channelIds);

      // Use setTimeout to prevent infinite loop
      const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
      const collectMessages = async () => {
        for await (const message of generator) {
          messages.push(message);
          if (messages.length >= 1) break;
        }
      };

      await Promise.race([collectMessages(), timeout]);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SSE connection failed'),
        expect.any(String),
      );
      expect(messages).toHaveLength(1);
    });

    it('should handle HTTP error responses', async () => {
      const channelIds = ['-1001234567890'];
      
      const mockResponse = {
        ok: false,
        status: 503,
      };

      mockFetch.mockResolvedValueOnce(mockResponse);
      // Mock second attempt to succeed so it doesn't hang
      const ssePayload = `event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345,"occurredAt":"2026-08-30T00:01:00Z","media":[],"entities":[],"messageType":"kol"}

`;
      const mockReader = createMockReader([ssePayload]);
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };
      mockFetch.mockResolvedValueOnce(mockSuccessResponse);

      const generator = adapter.subscribe(channelIds);

      // Collect first message after reconnect
      const messages: TelegramRawMessage[] = [];
      for await (const message of generator) {
        messages.push(message);
        break;
      }

      // Verify it reconnected
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SSE connection failed'),
        expect.any(String),
      );
      expect(messages).toHaveLength(1);
    });

    it('should handle missing response body', async () => {
      const channelIds = ['-1001234567890'];
      
      const mockResponse = {
        ok: true,
        status: 200,
        body: null,
      };

      mockFetch.mockResolvedValueOnce(mockResponse);
      // Mock second attempt to succeed
      const ssePayload = `event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345,"occurredAt":"2026-08-30T00:01:00Z","media":[],"entities":[],"messageType":"kol"}

`;
      const mockReader = createMockReader([ssePayload]);
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };
      mockFetch.mockResolvedValueOnce(mockSuccessResponse);

      const generator = adapter.subscribe(channelIds);

      // Collect first message after reconnect
      const messages: TelegramRawMessage[] = [];
      for await (const message of generator) {
        messages.push(message);
        break;
      }

      // Verify it detected error and reconnected
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SSE connection failed'),
        expect.stringContaining('no body'),
      );
      expect(messages).toHaveLength(1);
    });
  });

  describe('payloadToRawMessage()', () => {
    it('should transform MessagePayload to TelegramRawMessage with correct media URL format', () => {
      const payload = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: '2026-08-30T00:01:00Z',
        media: [
          {
            type: 'photo' as const,
            index: 0,
            url: 'http://localhost:3031/api/media/-1001234567890/12345/0',
            mimeType: 'image/jpeg',
            fileSize: 245678,
          },
          {
            type: 'video' as const,
            index: 1,
            url: 'http://localhost:3031/api/media/-1001234567890/12345/1',
            mimeType: 'video/mp4',
            fileSize: 1024000,
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

      // Access private method through reflection
      const result = (adapter as any).payloadToRawMessage(payload);

      expect(result).toMatchObject({
        peerId: '-1001234567890',
        messageId: 12345,
        text: '', // Per Invariant 1: text excluded
        entities: [
          {
            type: 'url',
            offset: 10,
            length: 20,
            url: 'https://example.com',
          },
        ],
      });

      expect(result.occurredAt).toEqual(new Date('2026-08-30T00:01:00Z'));
      expect(result.groupedId).toEqual(BigInt('123456789'));

      // Verify media URL format
      expect(result.media).toHaveLength(2);
      expect(result.media[0]).toMatchObject({
        type: 'photo',
        index: 0,
        filePath: 'http://localhost:3031/api/media/-1001234567890/12345/0',
        mimeType: 'image/jpeg',
        fileSize: 245678,
      });
      expect(result.media[1]).toMatchObject({
        type: 'video',
        index: 1,
        filePath: 'http://localhost:3031/api/media/-1001234567890/12345/1',
        mimeType: 'video/mp4',
        fileSize: 1024000,
      });
    });

    it('should handle payload without groupedId', () => {
      const payload = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: '2026-08-30T00:01:00Z',
        media: [],
        entities: [],
        messageType: 'crypto-news' as const,
      };

      const result = (adapter as any).payloadToRawMessage(payload);

      expect(result.groupedId).toBeUndefined();
    });

    it('should handle payload with empty media array', () => {
      const payload = {
        peerId: '-1001234567890',
        messageId: 12345,
        occurredAt: '2026-08-30T00:01:00Z',
        media: [],
        entities: [],
        messageType: 'kol' as const,
      };

      const result = (adapter as any).payloadToRawMessage(payload);

      expect(result.media).toEqual([]);
    });
  });

  describe('calculateBackoff()', () => {
    it('should calculate exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)', () => {
      // Reset reconnect attempts
      (adapter as any).reconnectAttempts = 0;

      const delays: number[] = [];
      
      // Calculate 6 backoff delays
      for (let i = 0; i < 6; i++) {
        const delay = (adapter as any).calculateBackoff();
        delays.push(delay);
      }

      expect(delays[0]).toBe(1000);  // 1s
      expect(delays[1]).toBe(2000);  // 2s
      expect(delays[2]).toBe(4000);  // 4s
      expect(delays[3]).toBe(8000);  // 8s
      expect(delays[4]).toBe(16000); // 16s
      expect(delays[5]).toBe(30000); // 30s (capped)
    });

    it('should cap at maxReconnectDelay (30s)', () => {
      (adapter as any).reconnectAttempts = 0;

      const delays: number[] = [];
      
      // Calculate 10 backoff delays to verify cap
      for (let i = 0; i < 10; i++) {
        const delay = (adapter as any).calculateBackoff();
        delays.push(delay);
      }

      // All delays after 5th should be capped at 30s
      expect(delays[5]).toBe(30000);
      expect(delays[6]).toBe(30000);
      expect(delays[7]).toBe(30000);
      expect(delays[8]).toBe(30000);
      expect(delays[9]).toBe(30000);
    });

    it('should increment reconnectAttempts counter', () => {
      (adapter as any).reconnectAttempts = 0;

      (adapter as any).calculateBackoff();
      expect((adapter as any).reconnectAttempts).toBe(1);

      (adapter as any).calculateBackoff();
      expect((adapter as any).reconnectAttempts).toBe(2);
    });
  });

  describe('parseSSE()', () => {
    it('should parse valid SSE event with JSON data', () => {
      const chunk = `event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345}`;

      const result = (adapter as any).parseSSE(chunk);

      expect(result).toEqual({
        event: 'message:telegram',
        data: {
          peerId: '-1001234567890',
          messageId: 12345,
        },
      });
    });

    it('should handle malformed JSON gracefully', () => {
      const chunk = `event: message:telegram
data: {invalid json here}`;

      const result = (adapter as any).parseSSE(chunk);

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse SSE data'),
        expect.any(String),
      );
    });

    it('should return null for missing event field', () => {
      const chunk = `data: {"peerId":"-1001234567890"}`;

      const result = (adapter as any).parseSSE(chunk);

      expect(result).toBeNull();
    });

    it('should return null for missing data field', () => {
      const chunk = `event: message:telegram`;

      const result = (adapter as any).parseSSE(chunk);

      expect(result).toBeNull();
    });

    it('should handle empty chunk', () => {
      const chunk = '';

      const result = (adapter as any).parseSSE(chunk);

      expect(result).toBeNull();
    });

    it('should handle multi-line data field', () => {
      const chunk = `event: message:telegram
data: {"peerId":"-1001234567890","messageId":12345}`;

      const result = (adapter as any).parseSSE(chunk);

      expect(result).not.toBeNull();
      expect(result?.event).toBe('message:telegram');
    });

    it('should handle SSE with extra whitespace', () => {
      const chunk = `event: health:ping  
data: {"timestamp":"2026-08-30T00:00:00Z"}  `;

      const result = (adapter as any).parseSSE(chunk);

      expect(result).toEqual({
        event: 'health:ping',
        data: {
          timestamp: '2026-08-30T00:00:00Z',
        },
      });
    });
  });

  describe('backfill()', () => {
    it('should return Promise<TelegramRawMessage[]> from SSE stream', async () => {
      const channelId = '-1001234567890';
      const limit = 5;

      const ssePayload = `event: backfill:message
data: {"peerId":"-1001234567890","messageId":12340,"occurredAt":"2026-08-30T00:00:00Z","media":[],"entities":[],"messageType":"kol"}

event: backfill:message
data: {"peerId":"-1001234567890","messageId":12341,"occurredAt":"2026-08-30T00:01:00Z","media":[],"entities":[],"messageType":"kol"}

event: backfill:complete
data: {"count":2}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const messages = await adapter.backfill(channelId, limit);

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:3031/api/ingestion/backfill/${channelId}?limit=${limit}`,
        expect.objectContaining({
          headers: { Accept: 'text/event-stream' },
        }),
      );

      expect(messages).toHaveLength(2);
      expect(messages[0].messageId).toBe(12340);
      expect(messages[1].messageId).toBe(12341);
      expect(logger.log).toHaveBeenCalledWith(
        'Backfill complete: 2 messages retrieved',
      );
    });

    it('should cap limit at 100', async () => {
      const channelId = '-1001234567890';
      const limit = 500; // Request more than max

      const ssePayload = `event: backfill:complete
data: {"count":0}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await adapter.backfill(channelId, limit);

      // Verify limit was capped to 100
      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:3031/api/ingestion/backfill/${channelId}?limit=100`,
        expect.any(Object),
      );
    });

    it('should handle backfill:error event', async () => {
      const channelId = '-1001234567890';
      const limit = 5;

      const ssePayload = `event: backfill:error
data: {"error":"Channel not found"}

`;

      const mockReader = createMockReader([ssePayload]);
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(adapter.backfill(channelId, limit)).rejects.toThrow(
        'Backfill error: Channel not found',
      );
    });

    it('should handle backfill HTTP error', async () => {
      const channelId = '-1001234567890';
      const limit = 5;

      const mockResponse = {
        ok: false,
        status: 404,
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(adapter.backfill(channelId, limit)).rejects.toThrow(
        'Backfill request failed: HTTP 404',
      );
    });

    it('should timeout after 60 seconds', async () => {
      const channelId = '-1001234567890';
      const limit = 5;

      // Create a reader that never completes
      const mockReader = {
        read: jest.fn().mockImplementation(() => new Promise(() => {})),
        releaseLock: jest.fn(),
      };

      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      // Mock setTimeout to trigger immediately
      jest.useFakeTimers();
      
      const backfillPromise = adapter.backfill(channelId, limit);
      
      // Fast-forward time
      jest.advanceTimersByTime(60000);

      await expect(backfillPromise).rejects.toThrow();

      jest.useRealTimers();
    });

    it('should return empty array if stream ends without backfill:complete', async () => {
      const channelId = '-1001234567890';
      const limit = 5;

      const ssePayload = `event: backfill:message
data: {"peerId":"-1001234567890","messageId":12340,"occurredAt":"2026-08-30T00:00:00Z","media":[],"entities":[],"messageType":"kol"}

`;

      const mockReader = createMockReader([ssePayload], true); // done=true
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const messages = await adapter.backfill(channelId, limit);

      expect(messages).toHaveLength(1); // Messages before done
    });
  });

  describe('disconnect()', () => {
    it('should abort active connection', async () => {
      const mockAbortController = {
        abort: jest.fn(),
      };

      (adapter as any).abortController = mockAbortController;

      await adapter.disconnect();

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect((adapter as any).abortController).toBeNull();
      expect(logger.log).toHaveBeenCalledWith('SSE connection disconnected');
    });

    it('should handle disconnect when no active connection', async () => {
      (adapter as any).abortController = null;

      await adapter.disconnect();

      expect(logger.log).not.toHaveBeenCalledWith('SSE connection disconnected');
    });
  });

  describe('resolveChannelMetadata()', () => {
    it('should return placeholder metadata with warning', async () => {
      const channelId = '-1001234567890';

      const result = await adapter.resolveChannelMetadata(channelId);

      expect(result).toEqual({
        peerId: channelId,
        title: `Channel ${channelId}`,
        handle: null,
        kind: 'unknown',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('resolveChannelMetadata not implemented'),
      );
    });
  });

  describe('joinChannel()', () => {
    it('should return error result with warning', async () => {
      const peerId = '-1001234567890';

      const result = await adapter.joinChannel(peerId);

      expect(result).toEqual({
        joined: false,
        wasAlreadyMember: false,
        error: 'SSE adapter does not support joinChannel - use Ingestion Service',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('joinChannel not implemented'),
      );
    });
  });
});

/**
 * Helper to create a mock ReadableStream reader
 */
function createMockReader(chunks: string[], endImmediately = false) {
  let index = 0;
  const encoder = new TextEncoder();

  return {
    read: jest.fn().mockImplementation(() => {
      if (endImmediately || index >= chunks.length) {
        return Promise.resolve({ done: true, value: undefined });
      }

      const value = encoder.encode(chunks[index]);
      index++;

      return Promise.resolve({ done: false, value });
    }),
    releaseLock: jest.fn(),
  };
}
