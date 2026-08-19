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
      | 'find'
      | 'findOne'
      | 'save'
      | 'delete'
      | 'increment'
      | 'update'
      | 'createQueryBuilder'
    >
  >;

  const makeQb = () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([] as AdEntity[]),
    };
    return qb as never;
  };

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
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
          imageMediaId: null,
          enabled: true,
          order: 2,
          timesPublished: 0,
          consecutiveFailures: 0,
          lastPublishedAt: null,
          expiresAt: null,
          expirationAction: 'disable',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'ad-2',
          name: 'Ad Two',
          body: 'body2',
          imageMediaId: null,
          enabled: true,
          order: 1,
          timesPublished: 0,
          consecutiveFailures: 0,
          lastPublishedAt: null,
          expiresAt: null,
          expirationAction: 'disable',
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

    it('findAllActive filters enabled=true AND (expires_at IS NULL OR expires_at > now)', async () => {
      const now = new Date('2026-06-15T12:00:00.000Z');
      const qb = makeQb();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      await repo.findAllActive(now);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('ad');
      expect((qb as { where: jest.Mock }).where).toHaveBeenCalledWith(
        'ad.enabled = :enabled',
        { enabled: true },
      );
      expect((qb as { andWhere: jest.Mock }).andWhere).toHaveBeenCalledWith(
        'ad.expires_at IS NULL OR ad.expires_at > :now',
        {
          now,
        },
      );
    });

    it('findAllActive excludes past-expiry rows from the result set', async () => {
      const now = new Date('2026-06-15T12:00:00.000Z');
      const qb = makeQb();
      (qb as { getMany: jest.Mock }).getMany.mockResolvedValue([
        {
          id: 'ad-future',
          name: 'Future',
          body: 'body',
          imageMediaId: null,
          enabled: true,
          order: 1,
          timesPublished: 0,
          consecutiveFailures: 0,
          lastPublishedAt: null,
          expiresAt: new Date('2026-06-15T13:00:00.000Z'),
          expirationAction: 'disable',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as AdEntity[]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const active = await repo.findAllActive(now);
      expect(active.map((a) => a.id)).toEqual(['ad-future']);
      expect(active[0].expiresAt).toEqual(new Date('2026-06-15T13:00:00.000Z'));
    });
  });

  describe('findExpired', () => {
    it('returns rows with expires_at <= now ordered by order ASC', async () => {
      const now = new Date('2026-06-15T12:00:00.000Z');
      const qb = makeQb();
      (qb as { getMany: jest.Mock }).getMany.mockResolvedValue([
        {
          id: 'ad-past',
          name: 'Past',
          body: 'body',
          imageMediaId: null,
          enabled: true,
          order: 1,
          timesPublished: 0,
          consecutiveFailures: 0,
          lastPublishedAt: null,
          expiresAt: new Date('2026-06-15T11:00:00.000Z'),
          expirationAction: 'disable',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as AdEntity[]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const expired = await repo.findExpired(now);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('ad');
      expect((qb as { where: jest.Mock }).where).toHaveBeenCalledWith(
        'ad.expires_at IS NOT NULL AND ad.expires_at <= :now',
        { now },
      );
      expect(expired.map((a) => a.id)).toEqual(['ad-past']);
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
        imageMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      expect(ad!.imageMediaId).toBe('3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c');
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
        imageMediaId: ad.imageMediaId,
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
