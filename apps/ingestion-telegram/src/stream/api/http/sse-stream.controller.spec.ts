import { Test, TestingModule } from '@nestjs/testing';
import { SSEStreamController } from './sse-stream.controller';
import { StreamService } from '../../application/services/stream.service';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';

/**
 * SSEStreamController Tests (per-env-ingestion item 4 shape)
 *
 * Per-env model — ONE ingestion per env, no multi-backend registration gate:
 * - Any backend connects with NO prior register step and NO backendId param
 * - StreamService is the única vía (broadcast + 30s heartbeat)
 * - Per Requirement 6.4: Connection cleanup on disconnect
 */
describe('SSEStreamController', () => {
  let controller: SSEStreamController;
  let streamService: jest.Mocked<StreamService>;

  beforeEach(async () => {
    const mockStreamService = {
      addClient: jest.fn(),
      removeClient: jest.fn(),
      broadcast: jest.fn(),
      sendHeartbeat: jest.fn(),
      getClientCount: jest.fn().mockReturnValue(0),
      getConnectedClients: jest.fn().mockReturnValue([]),
      shutdown: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SSEStreamController],
      providers: [
        {
          provide: StreamService,
          useValue: mockStreamService,
        },
      ],
    }).compile();

    controller = module.get<SSEStreamController>(SSEStreamController);
    streamService = module.get(StreamService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stream endpoint (open, no registration gate)', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      // Create mock request that extends EventEmitter for 'close' and 'error' events
      mockRequest = Object.assign(new EventEmitter(), {
        ip: '127.0.0.1',
        query: {},
      }) as Partial<Request>;

      mockResponse = {
        set: jest.fn().mockReturnThis(),
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        writableEnded: false,
      } as Partial<Response>;
    });

    it('should connect WITHOUT any register step or backendId param', () => {
      // Per-env-ingestion item 4: the gate is gone — plain connect succeeds
      controller.stream(mockRequest as Request, mockResponse as Response);

      expect(streamService.addClient).toHaveBeenCalledTimes(1);
      expect(streamService.addClient).toHaveBeenCalledWith(
        expect.any(String),
        mockResponse,
      );
    });

    it('should generate a unique UUID clientId per connection', () => {
      controller.stream(mockRequest as Request, mockResponse as Response);

      expect(streamService.addClient).toHaveBeenCalledWith(
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
        mockResponse,
      );
    });

    it('should remove client on connection close (no registry bookkeeping)', () => {
      // Per Requirement 6.4: Remove connection on client disconnect
      controller.stream(mockRequest as Request, mockResponse as Response);

      const clientId = (streamService.addClient as jest.Mock).mock
        .calls[0][0] as string;

      // Simulate client disconnect
      (mockRequest as EventEmitter).emit('close');

      expect(streamService.removeClient).toHaveBeenCalledWith(clientId);
    });

    it('should remove client on connection error', () => {
      controller.stream(mockRequest as Request, mockResponse as Response);

      const clientId = (streamService.addClient as jest.Mock).mock
        .calls[0][0] as string;

      // Simulate connection error
      const testError = new Error('Connection lost');
      (mockRequest as EventEmitter).emit('error', testError);

      expect(streamService.removeClient).toHaveBeenCalledWith(clientId);
    });

    it('should handle multiple concurrent connections with unique ids', () => {
      const mockRequest1 = Object.assign(new EventEmitter(), {
        ip: '127.0.0.1',
      }) as Partial<Request>;
      const mockRequest2 = Object.assign(new EventEmitter(), {
        ip: '127.0.0.2',
      }) as Partial<Request>;

      const mockResponse1 = {
        set: jest.fn().mockReturnThis(),
        writeHead: jest.fn(),
      } as Partial<Response>;
      const mockResponse2 = {
        set: jest.fn().mockReturnThis(),
        writeHead: jest.fn(),
      } as Partial<Response>;

      controller.stream(mockRequest1 as Request, mockResponse1 as Response);
      controller.stream(mockRequest2 as Request, mockResponse2 as Response);

      expect(streamService.addClient).toHaveBeenCalledTimes(2);

      const clientId1 = (streamService.addClient as jest.Mock).mock
        .calls[0][0] as string;
      const clientId2 = (streamService.addClient as jest.Mock).mock
        .calls[1][0] as string;

      // Each connection should have unique clientId
      expect(clientId1).not.toBe(clientId2);
    });
  });

  describe('heartbeat functionality', () => {
    it('should rely on StreamService @Cron for heartbeat', () => {
      // Per Requirement 6.4: Heartbeat every 30 seconds via StreamService
      // The actual heartbeat is sent by StreamService.sendHeartbeat() via @Cron
      // This test verifies that the controller doesn't need to handle heartbeat itself
      const mockRequest = Object.assign(new EventEmitter(), {
        ip: '127.0.0.1',
      }) as Partial<Request>;

      const mockResponse = {
        set: jest.fn().mockReturnThis(),
        writeHead: jest.fn(),
      } as Partial<Response>;

      controller.stream(mockRequest as Request, mockResponse as Response);

      // Controller just adds client, StreamService handles heartbeat
      expect(streamService.addClient).toHaveBeenCalled();

      // Note: The actual heartbeat test is in StreamService.spec.ts
      // StreamService.sendHeartbeat() is decorated with @Cron('*/30 * * * * *')
    });
  });
});
