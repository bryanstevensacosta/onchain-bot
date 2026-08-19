import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmAdRotationConfigRepository } from '../typeorm-ad-rotation-config.repository';
import { AdRotationConfigEntity } from '../../entities/ad-rotation-config.entity';

describe('TypeOrmAdRotationConfigRepository', () => {
  let repo: TypeOrmAdRotationConfigRepository;
  let mockRepo: jest.Mocked<
    Pick<Repository<AdRotationConfigEntity>, 'findOne' | 'save'>
  >;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmAdRotationConfigRepository,
        {
          provide: getRepositoryToken(AdRotationConfigEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    repo = moduleRef.get<TypeOrmAdRotationConfigRepository>(
      TypeOrmAdRotationConfigRepository,
    );
  });

  describe('load', () => {
    it('maps the singleton row (id=1)', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        enabled: true,
        everyNPosts: 4,
        minMinutesBetweenAds: 30,
        createdAt: new Date('2026-01-01T10:00:00Z'),
        updatedAt: new Date('2026-01-01T10:00:00Z'),
      });
      const cfg = await repo.load();
      expect(cfg.id).toBe(1);
      expect(cfg.enabled).toBe(true);
      expect(cfg.everyNPosts).toBe(4);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('returns the disabled default when the row is missing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const cfg = await repo.load();
      expect(cfg.enabled).toBe(false);
      expect(cfg.everyNPosts).toBe(4);
    });
  });

  describe('save', () => {
    it('persists the config via the mapper', async () => {
      mockRepo.save.mockResolvedValue({} as AdRotationConfigEntity);
      const cfg = await repo.load();
      await repo.save(cfg);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, everyNPosts: 4 }),
      );
    });
  });
});
