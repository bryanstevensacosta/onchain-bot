import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SSEStreamController } from './sse-stream.controller';
import { StreamService } from '../../application/services/stream.service';
import { SSEBroadcastService } from '../../application/services/sse-broadcast.service';
import { BackfillBufferService } from '../../infrastructure/backfill-buffer.service';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';

/**
 * SSEStreamController Integration Tests
 *
 * Tests:
 * - Per Requirement 2.2: Validate backendId against registered backends
 * - Per Requirement 2.3: Reject connection with 401 if not registered
 * - Per Requirement 4.3: Accept query params backendId and lastSeenTimestamp
 * - Per Requirement 6.4: Connection cleanup on disconnect
 * - Heartbeat received within 30s (via StreamService @Cron)
 */
describe('SSEStreamController', () => {
  let controller: SSEStreamController;
  let streamService: jest.Mocked<StreamService>;
  let channelProvider: jest.Mocked<BackendChannelProviderService>;

  beforeEach(async () => {
    // Create mock StreamService
    const mockStreamService = {
      addClient: jest.fn(),
      removeClient: jest.fn(),
      broadcast: jest.fn(),
      sendHeartbeat: jest.fn(),
      getClientCount: jest.fn().mockReturnValue(0),
      getConnectedClients: jest.fn().mockReturnValue([]),
      shutdown: jest.fn(),
    };

    // Create mock BackendChannelProviderService
    const mockChannelProvider = {
      getRegisteredBackendIds: jest.fn(),
      registerBackend: jest.fn(),
      recordDisconnect: jest.fn(),
      fetchAllActiveChannelIds: jest.fn().mockResolvedValue([]),
      getChannelUnionSize: jest.fn().mockReturnValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SSEStreamController],
      providers: [
        {
          provide: StreamService,
          useValue: mockStreamService,
        },
        {
          provide: SSEBroadcastService,
          useValue: {
            getActiveBackendCount: jest.fn().mockReturnValue(0),
            broadcast: jest.fn(),
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
          },
        },
        {
          provide: BackendChannelProviderService,
          useValue: mockChannelProvider,
        },
        {
          provide: BackfillBufferService,
          useValue: {
            getSize: jest.fn().mockReturnValue(0),
            getOldestTimestamp: jest.fn().mockReturnValue(null),
            getEventsSince: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<SSEStreamController>(SSEStreamController);
    streamService = module.get(StreamService);
    channelProvider = module.get(BackendChannelProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stream endpoint', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      // Create mock request that extends EventEmitter for 'close' and 'error' events
      mockRequest = Object.assign(new EventEmitter(), {
        ip: '127.0.0.1',
        query: {},
      }) as Partial<Request>;

      mockResponse = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        writableEnded: false,
      } as Partial<Response>;
    });

    it('should reject connection when backendId is missing', () => {
      // Per Requirement 4.3: backendId query parameter is required
      expect(() => {
        controller.stream(
          undefined,
          undefined,
          mockRequest as Request,
          mockResponse as Response,
        );
      }).toThrow(BadRequestException);

      expect(streamService.addClient).not.toHaveBeenCalled();
    });

    it('should reject connection when backendId is empty string', () => {
      expect(() => {
        controller.stream(
          '   ',
          undefined,
          mockRequest as Request,
          mockResponse as Response,
        );
      }).toThrow(BadRequestException);

      expect(streamService.addClient).not.toHaveBeenCalled();
    });

    it('should reject connection when backendId is not registered', () => {
      // Per Requirement 2.2 & 2.3: Validate and reject unregistered backends
      channelProvider.getRegisteredBackendIds.mockReturnValue([
        'production',
        'staging',
      ]);

      expect(() => {
        controller.stream(
          'unknown-backend',
          undefined,
          mockRequest as Request,
          mockResponse as Response,
        );
      }).toThrow(UnauthorizedException);

      expect(channelProvider.getRegisteredBackendIds).toHaveBeenCalled();
      expect(streamService.addClient).not.toHaveBeenCalled();
    });

    it('should accept connection when backendId is registered', () => {
      // Per Requirement 2.2: Accept connection for registered backends
      channelProvider.getRegisteredBackendIds.mockReturnValue([
        'production',
        'staging',
      ]);

      controller.stream(
        'production',
        undefined,
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(channelProvider.getRegisteredBackendIds).toHaveBeenCalled();
      expect(streamService.addClient).toHaveBeenCalledWith(
        expect.stringContaining('production-'),
        mockResponse,
      );
    });

    it('should generate unique clientId with backendId prefix', () => {
      channelProvider.getRegisteredBackendIds.mockReturnValue(['staging']);

      controller.stream(
        'staging',
        undefined,
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(streamService.addClient).toHaveBeenCalledWith(
        expect.stringMatching(/^staging-[0-9a-f-]{36}$/),
        mockResponse,
      );
    });

    it('should accept optional lastSeenTimestamp parameter', () => {
      // Per Requirement 4.3: Accept lastSeenTimestamp query parameter
      channelProvider.getRegisteredBackendIds.mockReturnValue(['production']);

      const timestamp = '2024-01-01T00:00:00.000Z';
      controller.stream(
        'production',
        timestamp,
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(streamService.addClient).toHaveBeenCalled();
      // Note: Backfill not implemented in this task, just verify it doesn't break
    });

    it('should remove client and record disconnect on connection close', () => {
      // Per Requirement 6.4: Remove connection on client disconnect
      channelProvider.getRegisteredBackendIds.mockReturnValue(['production']);

      controller.stream(
        'production',
        undefined,
        mockRequest as Request,
        mockResponse as Response,
      );

      const clientId = (streamService.addClient as jest.Mock).mock
        .calls[0][0] as string;

      // Simulate client disconnect
      (mockRequest as EventEmitter).emit('close');

      expect(streamService.removeClient).toHaveBeenCalledWith(clientId);
      expect(channelProvider.recordDisconnect).toHaveBeenCalledWith(
        'production',
      );
    });

    it('should remove client and record disconnect on connection error', () => {
      channelProvider.getRegisteredBackendIds.mockReturnValue(['staging']);

      controller.stream(
        'staging',
        undefined,
        mockRequest as Request,
        mockResponse as Response,
      );

      const clientId = (streamService.addClient as jest.Mock).mock
        .calls[0][0] as string;

      // Simulate connection error
      const testError = new Error('Connection lost');
      (mockRequest as EventEmitter).emit('error', testError);

      expect(streamService.removeClient).toHaveBeenCalledWith(clientId);
      expect(channelProvider.recordDisconnect).toHaveBeenCalledWith('staging');
    });

    it('should handle multiple concurrent connections from same backend', () => {
      channelProvider.getRegisteredBackendIds.mockReturnValue(['production']);

      const mockRequest1 = Object.assign(new EventEmitter(), {
        ip: '127.0.0.1',
      }) as Partial<Request>;
      const mockRequest2 = Object.assign(new EventEmitter(), {
        ip: '127.0.0.2',
      }) as Partial<Request>;

      const mockResponse1 = { writeHead: jest.fn() } as Partial<Response>;
      const mockResponse2 = { writeHead: jest.fn() } as Partial<Response>;

      controller.stream(
        'production',
        undefined,
        mockRequest1 as Request,
        mockResponse1 as Response,
      );
      controller.stream(
        'production',
        undefined,
        mockRequest2 as Request,
        mockResponse2 as Response,
      );

      expect(streamService.addClient).toHaveBeenCalledTimes(2);

      const clientId1 = (streamService.addClient as jest.Mock).mock
        .calls[0][0] as string;
      const clientId2 = (streamService.addClient as jest.Mock).mock
        .calls[1][0] as string;

      // Each connection should have unique clientId
      expect(clientId1).not.toBe(clientId2);
      expect(clientId1).toMatch(/^production-/);
      expect(clientId2).toMatch(/^production-/);
    });

    it('should handle connections from multiple different backends', () => {
      channelProvider.getRegisteredBackendIds.mockReturnValue([
        'production',
        'staging',
        'development',
      ]);

      const createMockRequest = () =>
        Object.assign(new EventEmitter(), {
          ip: '127.0.0.1',
        }) as Partial<Request>;

      controller.stream(
        'production',
        undefined,
        createMockRequest() as Request,
        { writeHead: jest.fn() } as Partial<Response> as Response,
      );

      controller.stream(
        'staging',
        undefined,
        createMockRequest() as Request,
        { writeHead: jest.fn() } as Partial<Response> as Response,
      );

      controller.stream(
        'development',
        undefined,
        createMockRequest() as Request,
        { writeHead: jest.fn() } as Partial<Response> as Response,
      );

      expect(streamService.addClient).toHaveBeenCalledTimes(3);

      const calls = (streamService.addClient as jest.Mock).mock.calls;
      expect(calls[0][0]).toMatch(/^production-/);
      expect(calls[1][0]).toMatch(/^staging-/);
      expect(calls[2][0]).toMatch(/^development-/);
    });
  });

  describe('heartbeat functionality', () => {
    it('should rely on StreamService @Cron for heartbeat', () => {
      // Per Requirement 6.4: Heartbeat every 30 seconds via StreamService
      // The actual heartbeat is sent by StreamService.sendHeartbeat() via @Cron
      // This test verifies that the controller doesn't need to handle heartbeat itself

      channelProvider.getRegisteredBackendIds.mockReturnValue(['production']);

      const mockRequest = Object.assign(new EventEmitter(), {
        ip: '127.0.0.1',
      }) as Partial<Request>;

      const mockResponse = { writeHead: jest.fn() } as Partial<Response>;

      controller.stream(
        'production',
        undefined,
        mockRequest as Request,
        mockResponse as Response,
      );

      // Controller just adds client, StreamService handles heartbeat
      expect(streamService.addClient).toHaveBeenCalled();

      // Note: The actual heartbeat test is in StreamService.spec.ts
      // StreamService.sendHeartbeat() is decorated with @Cron('*/30 * * * * *')
    });
  });
});
