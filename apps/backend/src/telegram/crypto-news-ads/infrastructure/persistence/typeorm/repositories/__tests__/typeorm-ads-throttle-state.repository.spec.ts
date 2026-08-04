import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmAdsThrottleStateRepository } from '../typeorm-ads-throttle-state.repository';
import { AdsThrottleStateEntity } from '../../entities/ads-throttle-state.entity';
import { SharedThrottleState } from 'telegram/shared/domain/entities/shared-throttle-state.entity';

describe('TypeOrmAdsThrottleStateRepository', () => {
  let repo: TypeOrmAdsThrottleStateRepository;
  let mockRepo: jest.Mocked<
    Pick<Repository<AdsThrottleStateEntity>, 'findOne' | 'save'>
  >;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmAdsThrottleStateRepository,
        {
          provide: getRepositoryToken(AdsThrottleStateEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    repo = moduleRef.get<TypeOrmAdsThrottleStateRepository>(
      TypeOrmAdsThrottleStateRepository,
    );
  });

  describe('load', () => {
    it('returns empty state when no row exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const state = await repo.load();
      expect(state.lastPublishAt).toBeNull();
    });

    it('returns lastPublishAt when a row exists', async () => {
      const at = new Date('2026-01-01T12:00:00Z');
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        lastPublishAt: at,
        updatedAt: at,
      });
      const state = await repo.load();
      expect(state.lastPublishAt).toEqual(at);
    });
  });

  describe('save / setLastPublishAt / getLastPublishAt', () => {
    it('persists the singleton row with the given timestamp', async () => {
      mockRepo.save.mockResolvedValue({} as AdsThrottleStateEntity);
      await repo.save(SharedThrottleState.fromLastPublishAt(new Date()));
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
    });

    it('setLastPublishAt round-trips via load', async () => {
      const at = new Date('2026-01-01T12:00:00Z');
      mockRepo.save.mockImplementation(async (row) => {
        mockRepo.findOne.mockResolvedValue(row as AdsThrottleStateEntity);
        return row;
      });
      await repo.setLastPublishAt(at);
      expect(await repo.getLastPublishAt()).toEqual(at);
    });
  });
});
