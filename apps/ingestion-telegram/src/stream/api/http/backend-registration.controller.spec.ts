import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BackendRegistrationController } from './backend-registration.controller';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';
import { ConfigService } from '@nestjs/config';

describe('BackendRegistrationController', () => {
  let controller: BackendRegistrationController;
  let channelProvider: BackendChannelProviderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackendRegistrationController],
      providers: [
        BackendChannelProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('3030'),
          },
        },
      ],
    }).compile();

    controller = module.get<BackendRegistrationController>(
      BackendRegistrationController,
    );
    channelProvider = module.get<BackendChannelProviderService>(
      BackendChannelProviderService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a backend with valid input', () => {
      const dto = {
        backendId: 'production',
        sourceWhitelist: ['channel1', 'channel2', 'channel3'],
      };

      const result = controller.register(dto);

      expect(result.registered).toBe(true);
      expect(result.channelUnionSize).toBe(3);
      expect(result.message).toContain('production');
      expect(result.message).toContain('3 channels');
    });

    it('should register multiple backends and compute union size', () => {
      const dto1 = {
        backendId: 'production',
        sourceWhitelist: ['channel1', 'channel2'],
      };
      const dto2 = {
        backendId: 'staging',
        sourceWhitelist: ['channel2', 'channel3'],
      };

      const result1 = controller.register(dto1);
      expect(result1.channelUnionSize).toBe(2);

      const result2 = controller.register(dto2);
      // Union should be 3 unique channels (channel1, channel2, channel3)
      expect(result2.channelUnionSize).toBe(3);
    });

    it('should allow empty sourceWhitelist', () => {
      const dto = {
        backendId: 'dev',
        sourceWhitelist: [],
      };

      const result = controller.register(dto);

      expect(result.registered).toBe(true);
      expect(result.channelUnionSize).toBe(0);
    });

    it('should use default apiVersion when not provided', () => {
      const dto = {
        backendId: 'production',
        sourceWhitelist: ['channel1'],
      };

      const result = controller.register(dto);

      expect(result.registered).toBe(true);
    });

    it('should accept custom apiVersion', () => {
      const dto = {
        backendId: 'production',
        sourceWhitelist: ['channel1'],
        apiVersion: 'v2',
      };

      const result = controller.register(dto);

      expect(result.registered).toBe(true);
    });

    it('should throw BadRequestException when backendId is empty', () => {
      const dto = {
        backendId: '',
        sourceWhitelist: ['channel1'],
      };

      expect(() => controller.register(dto)).toThrow(BadRequestException);
      expect(() => controller.register(dto)).toThrow(
        'backendId cannot be empty',
      );
    });

    it('should throw BadRequestException when backendId is whitespace only', () => {
      const dto = {
        backendId: '   ',
        sourceWhitelist: ['channel1'],
      };

      expect(() => controller.register(dto)).toThrow(BadRequestException);
      expect(() => controller.register(dto)).toThrow(
        'backendId cannot be empty',
      );
    });

    it('should throw BadRequestException when backendId contains invalid characters', () => {
      const dto = {
        backendId: 'prod@ction!',
        sourceWhitelist: ['channel1'],
      };

      expect(() => controller.register(dto)).toThrow(BadRequestException);
      expect(() => controller.register(dto)).toThrow(
        'backendId must contain only alphanumeric characters, hyphens, and underscores',
      );
    });

    it('should allow backendId with hyphens and underscores', () => {
      const dto = {
        backendId: 'my-backend_123',
        sourceWhitelist: ['channel1'],
      };

      const result = controller.register(dto);

      expect(result.registered).toBe(true);
    });

    it('should update registration when same backendId registers again', () => {
      const dto1 = {
        backendId: 'production',
        sourceWhitelist: ['channel1', 'channel2'],
      };
      const dto2 = {
        backendId: 'production',
        sourceWhitelist: ['channel3', 'channel4', 'channel5'],
      };

      controller.register(dto1);
      const result2 = controller.register(dto2);

      // After re-registration, the channel union should reflect the new whitelist
      expect(result2.registered).toBe(true);
      expect(result2.channelUnionSize).toBe(3);
    });

    it('should handle duplicate channels in sourceWhitelist', () => {
      const dto = {
        backendId: 'production',
        sourceWhitelist: ['channel1', 'channel1', 'channel2'],
      };

      const result = controller.register(dto);

      expect(result.registered).toBe(true);
      // Should deduplicate to 2 unique channels
      expect(result.channelUnionSize).toBe(2);
    });

    it('should track registered backend IDs', () => {
      const dto1 = {
        backendId: 'production',
        sourceWhitelist: ['channel1'],
      };
      const dto2 = {
        backendId: 'staging',
        sourceWhitelist: ['channel2'],
      };

      controller.register(dto1);
      controller.register(dto2);

      const registeredIds = channelProvider.getRegisteredBackendIds();
      expect(registeredIds).toContain('production');
      expect(registeredIds).toContain('staging');
      expect(registeredIds).toHaveLength(2);
    });
  });
});
