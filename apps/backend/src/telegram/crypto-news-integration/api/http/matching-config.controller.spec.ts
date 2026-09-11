import { Test, TestingModule } from '@nestjs/testing';
import { MatchingConfigController } from './matching-config.controller';
import { MatchingConfigRepository } from 'telegram/crypto-news-integration/application/ports/matching-config.repository';
import { MatchingConfig } from 'telegram/crypto-news-integration/domain/entities/matching-config.entity';

describe('MatchingConfigController', () => {
  let controller: MatchingConfigController;
  let repo: jest.Mocked<MatchingConfigRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchingConfigController],
      providers: [
        {
          provide: MatchingConfigRepository,
          useValue: {
            load: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(MatchingConfigController);
    repo = module.get(MatchingConfigRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getConfig returns the single-row view (id=1)', async () => {
    repo.load.mockResolvedValue(
      MatchingConfig.reconstitute({
        id: 1,
        enabled: true,
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    );
    const view = await controller.getConfig();
    expect(view.id).toBe(1);
    expect(view.enabled).toBe(true);
    expect(view.updatedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('updateConfig patches enabled and persists (sole write path)', async () => {
    const cfg = MatchingConfig.reconstitute({
      id: 1,
      enabled: false,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    repo.load.mockResolvedValue(cfg);
    repo.save.mockResolvedValue(undefined);

    const view = await controller.updateConfig({ enabled: true });

    expect(view.enabled).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(cfg);
  });

  it('updateConfig with empty patch leaves enabled untouched', async () => {
    const cfg = MatchingConfig.reconstitute({
      id: 1,
      enabled: false,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    repo.load.mockResolvedValue(cfg);
    repo.save.mockResolvedValue(undefined);

    const view = await controller.updateConfig({});

    expect(view.enabled).toBe(false);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});
