import { Test, TestingModule } from '@nestjs/testing';
import { StreamStatusController } from './stream-status.controller';
import { SSEBroadcastService } from '../../application/services/sse-broadcast.service';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';
import { BackfillBufferService } from '../../infrastructure/backfill-buffer.service';

describe('StreamStatusController', () => {
  let controller: StreamStatusController;
  let mockSSEBroadcast: Partial<SSEBroadcastService>;
  let mockChannelProvider: Partial<BackendChannelProviderService>;
  let mockBackfillBuffer: Partial<BackfillBufferService>;

  beforeEach(async () => {
    // Create mocks
    mockSSEBroadcast = {
      getActiveBackendCount: jest.fn().mockReturnValue(2),
    };

    mockChannelProvider = {
      getChannelUnionSize: jest.fn().mockReturnValue(15),
      getRegisteredBackendIds: jest.fn().mockReturnValue(['staging', 'production']),
    };

    mockBackfillBuffer = {
      getSize: jest.fn().mockReturnValue(1234),
      getOldestTimestamp: jest.fn().mockReturnValue(Date.now() - 3600000), // 1 hour ago
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamStatusController],
      providers: [
        { provide: SSEBroadcastService, useValue: mockSSEBroadcast },
        { provide: BackendChannelProviderService, useValue: mockChannelProvider },
        { provide: BackfillBufferService, useValue: mockBackfillBuffer },
      ],
    }).compile();

    controller = module.get<StreamStatusController>(StreamStatusController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus()', () => {
    it('should return status with all required fields', () => {
      const status = controller.getStatus();

      expect(status).toHaveProperty('activeBackends');
      expect(status).toHaveProperty('channelUnionSize');
      expect(status).toHaveProperty('backfillBufferSize');
      expect(status).toHaveProperty('backfillBufferOldestTimestamp');
      expect(status).toHaveProperty('mtprotoConnected');
      expect(status).toHaveProperty('registeredBackends');
      expect(status).toHaveProperty('timestamp');
    });

    it('should call SSEBroadcastService.getActiveBackendCount()', () => {
      controller.getStatus();
      expect(mockSSEBroadcast.getActiveBackendCount).toHaveBeenCalled();
    });

    it('should call BackendChannelProviderService methods', () => {
      controller.getStatus();
      expect(mockChannelProvider.getChannelUnionSize).toHaveBeenCalled();
      expect(mockChannelProvider.getRegisteredBackendIds).toHaveBeenCalled();
    });

    it('should call BackfillBufferService methods', () => {
      controller.getStatus();
      expect(mockBackfillBuffer.getSize).toHaveBeenCalled();
      expect(mockBackfillBuffer.getOldestTimestamp).toHaveBeenCalled();
    });

    it('should return correct activeBackends count', () => {
      const status = controller.getStatus();
      expect(status.activeBackends).toBe(2);
    });

    it('should return correct channelUnionSize', () => {
      const status = controller.getStatus();
      expect(status.channelUnionSize).toBe(15);
    });

    it('should return correct backfillBufferSize', () => {
      const status = controller.getStatus();
      expect(status.backfillBufferSize).toBe(1234);
    });

    it('should return registeredBackends array', () => {
      const status = controller.getStatus();
      expect(status.registeredBackends).toEqual(['staging', 'production']);
    });

    it('should return ISO timestamp', () => {
      const status = controller.getStatus();
      expect(status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle null backfillBufferOldestTimestamp', () => {
      mockBackfillBuffer.getOldestTimestamp = jest.fn().mockReturnValue(null);
      const status = controller.getStatus();
      expect(status.backfillBufferOldestTimestamp).toBeNull();
    });

    it('should handle zero activeBackends', () => {
      mockSSEBroadcast.getActiveBackendCount = jest.fn().mockReturnValue(0);
      const status = controller.getStatus();
      expect(status.activeBackends).toBe(0);
    });

    it('should handle empty registeredBackends', () => {
      mockChannelProvider.getRegisteredBackendIds = jest.fn().mockReturnValue([]);
      const status = controller.getStatus();
      expect(status.registeredBackends).toEqual([]);
    });
  });
});
