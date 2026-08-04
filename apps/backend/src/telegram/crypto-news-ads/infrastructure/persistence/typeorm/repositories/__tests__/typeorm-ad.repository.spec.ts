import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmAdRepository } from '../typeorm-ad.repository';
import { AdEntity } from '../../entities/ad.entity';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';

describe('TypeOrmAdRepository', () => {
  let repo: TypeOrmAdRepository;
  let mockRepo: jest.Mocked<
    Pick<
      Repository<AdEntity>,
      'find' | 'findOne' | 'save' | 'delete' | 'increment' | 'update'
    >
  >;

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmAdRepository,
        {
          provide: getRepositoryToken(AdEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    repo = moduleRef.get<TypeOrmAdRepository>(TypeOrmAdRepository);
  });

  describe('findAll / findAllActive', () => {
    it('round-trips rows to domain Ad sorted by order', async () => {
      mockRepo.find.mockResolvedValue([
        {
          id: 'ad-1',
          name: 'Ad One',
          body: 'body',
          imagePath: null,
          enabled: true,
          order: 2,
          timesPublished: 0,
          consecutiveFailures: 0,
          lastPublishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'ad-2',
          name: 'Ad Two',
          body: 'body2',
          imagePath: null,
          enabled: true,
          order: 1,
          timesPublished: 0,
          consecutiveFailures: 0,
          lastPublishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as AdEntity[]);
      const all = await repo.findAll();
      expect(all.map((a) => a.name)).toEqual(['Ad One', 'Ad Two']);
      expect(mockRepo.find).toHaveBeenCalledWith({
        order: { order: 'ASC' },
      });
    });

    it('findAllActive filters enabled=true', async () => {
      mockRepo.find.mockResolvedValue([]);
      await repo.findAllActive();
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { enabled: true },
        order: { order: 'ASC' },
      });
    });
  });

  describe('findById', () => {
    it('returns null when no row', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });

    it('maps a row to domain Ad', async () => {
      const row: AdEntity = {
        id: 'ad-1',
        name: 'Ad One',
        body: 'body',
        imagePath: '/img.png',
        enabled: false,
        order: 0,
        timesPublished: 3,
        consecutiveFailures: 2,
        lastPublishedAt: new Date('2026-01-01T12:00:00Z'),
        createdAt: new Date('2026-01-01T10:00:00Z'),
        updatedAt: new Date('2026-01-01T12:00:00Z'),
      };
      mockRepo.findOne.mockResolvedValue(row);
      const ad = await repo.findById('ad-1');
      expect(ad).not.toBeNull();
      expect(ad!.id).toBe('ad-1');
      expect(ad!.imagePath).toBe('/img.png');
      expect(ad!.timesPublished).toBe(3);
    });
  });

  describe('save', () => {
    it('persists a domain Ad and returns it', async () => {
      const ad = Ad.create({ name: 'Ad One', body: 'body' });
      const savedRow: AdEntity = {
        id: ad.id,
        name: ad.name,
        body: ad.body,
        imagePath: ad.imagePath,
        enabled: ad.enabled,
        order: ad.order,
        timesPublished: ad.timesPublished,
        consecutiveFailures: ad.consecutiveFailures,
        lastPublishedAt: ad.lastPublishedAt,
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt,
      };
      mockRepo.save.mockResolvedValue(savedRow);
      const result = await repo.save(ad);
      expect(result.id).toBe(ad.id);
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 } as never);
      await repo.delete('ad-1');
      expect(mockRepo.delete).toHaveBeenCalledWith('ad-1');
    });
  });

  describe('incrementFailures / disable / markPublished', () => {
    it('increments consecutiveFailures', async () => {
      mockRepo.increment.mockResolvedValue({ affected: 1 } as never);
      await repo.incrementFailures('ad-1');
      expect(mockRepo.increment).toHaveBeenCalledWith(
        { id: 'ad-1' },
        'consecutiveFailures',
        1,
      );
    });

    it('disables an ad', async () => {
      mockRepo.update.mockResolvedValue({ affected: 1 } as never);
      await repo.disable('ad-1');
      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: 'ad-1' },
        { enabled: false },
      );
    });

    it('markPublished bumps timesPublished and sets lastPublishedAt', async () => {
      const at = new Date('2026-01-01T12:00:00Z');
      mockRepo.update.mockResolvedValue({ affected: 1 } as never);
      await repo.markPublished('ad-1', 'msg-42', at);
      const [, setClause] = mockRepo.update.mock.calls[0];
      expect(mockRepo.update).toHaveBeenCalledWith({ id: 'ad-1' }, setClause);
      expect(setClause).toMatchObject({ lastPublishedAt: at });
      expect(typeof (setClause as Record<string, unknown>).timesPublished).toBe(
        'function',
      );
    });
  });
});
