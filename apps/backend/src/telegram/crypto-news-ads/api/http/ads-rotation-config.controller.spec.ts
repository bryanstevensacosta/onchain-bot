import { Test, TestingModule } from '@nestjs/testing';
import { AdsRotationConfigController } from './ads-rotation-config.controller';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';

describe('AdsRotationConfigController', () => {
  let controller: AdsRotationConfigController;
  let rotationConfigRepo: jest.Mocked<AdRotationConfigRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsRotationConfigController],
      providers: [
        {
          provide: AdRotationConfigRepository,
          useValue: {
            load: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AdsRotationConfigController);
    rotationConfigRepo = module.get(AdRotationConfigRepository);
  });

  describe('get', () => {
    it('returns the live rotation config view', async () => {
      rotationConfigRepo.load.mockResolvedValue(AdRotationConfig.empty());
      const view = await controller.get();
      expect(view.enabled).toBe(false);
      expect(view.everyNPosts).toBe(4);
      expect(view.minMinutesBetweenAds).toBe(30);
    });
  });

  describe('update', () => {
    it('patches the config and persists', async () => {
      const cfg = AdRotationConfig.empty();
      rotationConfigRepo.load.mockResolvedValue(cfg);
      rotationConfigRepo.save.mockImplementation(async () => {
        return;
      });
      const view = await controller.update({
        enabled: true,
        everyNPosts: 6,
        minMinutesBetweenAds: 45,
      });
      expect(view.enabled).toBe(true);
      expect(view.everyNPosts).toBe(6);
      expect(view.minMinutesBetweenAds).toBe(45);
      expect(rotationConfigRepo.save).toHaveBeenCalledTimes(1);
    });

    it('keeps unchanged fields from the current config', async () => {
      const cfg = AdRotationConfig.empty();
      rotationConfigRepo.load.mockResolvedValue(cfg);
      rotationConfigRepo.save.mockImplementation(async () => undefined);
      const view = await controller.update({ enabled: true });
      expect(view.enabled).toBe(true);
      expect(view.everyNPosts).toBe(4);
      expect(view.minMinutesBetweenAds).toBe(30);
    });
  });
});
