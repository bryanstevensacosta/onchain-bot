import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramFeedSourceEntity } from '../entities/telegram-feed-source.entity';
import { TelegramFeedSourceRepository } from './typeorm-feed-source.repository';

describe('TelegramFeedSourceRepository', () => {
  let repo: TelegramFeedSourceRepository;
  let mockTypeOrmRepo: jest.Mocked<
    Pick<
      Repository<TelegramFeedSourceEntity>,
      'find' | 'findOne' | 'count' | 'save' | 'create' | 'delete'
    >
  >;

  beforeEach(async () => {
    mockTypeOrmRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramFeedSourceRepository,
        {
          provide: getRepositoryToken(TelegramFeedSourceEntity),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repo = module.get<TelegramFeedSourceRepository>(
      TelegramFeedSourceRepository,
    );
  });

  describe('create()', () => {
    it('should build a crypto-news source by default', () => {
      const built = {
        channelId: '-1001',
        title: 'News',
        handle: null,
        type: 'crypto-news',
        isActive: true,
        lifecycleStatus: 'ACTIVE',
        lastIngestedAt: null,
      } as TelegramFeedSourceEntity;
      mockTypeOrmRepo.create.mockReturnValue(built);

      const result = repo.create('-1001', 'News');

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith({
        channelId: '-1001',
        title: 'News',
        handle: null,
        type: 'crypto-news',
        isActive: true,
        lifecycleStatus: 'ACTIVE',
        lastIngestedAt: null,
      });
      expect(result.type).toBe('crypto-news');
      expect(result.isActive).toBe(true);
    });

    it('should build a kol source with handle when provided', () => {
      const built = {
        channelId: '-1002',
        title: 'KOL',
        handle: 'spykol',
        type: 'kol',
        isActive: true,
        lifecycleStatus: 'ACTIVE',
        lastIngestedAt: null,
      } as TelegramFeedSourceEntity;
      mockTypeOrmRepo.create.mockReturnValue(built);

      const result = repo.create('-1002', 'KOL', 'spykol', 'kol');

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ handle: 'spykol', type: 'kol' }),
      );
      expect(result.handle).toBe('spykol');
    });
  });

  describe('findAllActive()', () => {
    const activeNews = {
      channelId: '-1001',
      title: 'News',
    } as TelegramFeedSourceEntity;

    it('should query ACTIVE + isActive with channelId/title projection and no type filter', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([activeNews]);

      const result = await repo.findAllActive();

      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { lifecycleStatus: 'ACTIVE', isActive: true },
        select: ['channelId', 'title'],
      });
      expect(result).toEqual([{ channelId: '-1001', title: 'News' }]);
    });

    it('should filter by type when provided', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([activeNews]);

      await repo.findAllActive('kol');

      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { lifecycleStatus: 'ACTIVE', isActive: true, type: 'kol' },
        select: ['channelId', 'title'],
      });
    });

    it('should filter by crypto-news type when provided', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([activeNews]);

      const result = await repo.findAllActive('crypto-news');

      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: {
          lifecycleStatus: 'ACTIVE',
          isActive: true,
          type: 'crypto-news',
        },
        select: ['channelId', 'title'],
      });
      expect(result).toHaveLength(1);
    });

    it('should fail-open with [] on DB error', async () => {
      mockTypeOrmRepo.find.mockRejectedValue(new Error('connection lost'));

      const result = await repo.findAllActive('kol');

      expect(result).toEqual([]);
    });
  });

  describe('findAll()', () => {
    it('should order by addedAt DESC', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      await repo.findAll();

      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        order: { addedAt: 'DESC' },
      });
    });

    it('should fail-open with [] on DB error', async () => {
      mockTypeOrmRepo.find.mockRejectedValue(new Error('down'));

      expect(await repo.findAll()).toEqual([]);
    });
  });

  describe('findByChannelId()', () => {
    it('should return the entity when found', async () => {
      const entity = { channelId: '-1001' } as TelegramFeedSourceEntity;
      mockTypeOrmRepo.findOne.mockResolvedValue(entity);

      expect(await repo.findByChannelId('-1001')).toBe(entity);
    });

    it('should return null when missing', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      expect(await repo.findByChannelId('-9999')).toBeNull();
    });

    it('should fail-open with null on DB error', async () => {
      mockTypeOrmRepo.findOne.mockRejectedValue(new Error('down'));

      expect(await repo.findByChannelId('-1001')).toBeNull();
    });
  });

  describe('save() — duplicate create path', () => {
    it('should persist and return the saved entity', async () => {
      const entity = { channelId: '-1001' } as TelegramFeedSourceEntity;
      mockTypeOrmRepo.save.mockResolvedValue(entity);

      expect(await repo.save(entity)).toBe(entity);
    });

    it('should throw on duplicate PK (23505) so callers map to 409', async () => {
      const duplicate = Object.assign(new Error('duplicate key value'), {
        code: '23505',
      });
      mockTypeOrmRepo.save.mockRejectedValue(duplicate);

      await expect(
        repo.save({ channelId: '-1001' } as TelegramFeedSourceEntity),
      ).rejects.toThrow('duplicate key value');
    });
  });

  describe('isActiveFeedChannel()', () => {
    it('should return true when count > 0', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(1);

      expect(await repo.isActiveFeedChannel('-1001')).toBe(true);
    });

    it('should return false when count is 0', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(0);

      expect(await repo.isActiveFeedChannel('-1001')).toBe(false);
    });

    it('should fail-open with false on DB error', async () => {
      mockTypeOrmRepo.count.mockRejectedValue(new Error('down'));

      expect(await repo.isActiveFeedChannel('-1001')).toBe(false);
    });
  });

  describe('delete()', () => {
    it('should delete by channelId', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 1, raw: {} });

      await repo.delete('-1001');

      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith({
        channelId: '-1001',
      });
    });

    it('should throw on DB error (mirrors template)', async () => {
      mockTypeOrmRepo.delete.mockRejectedValue(new Error('down'));

      await expect(repo.delete('-1001')).rejects.toThrow('down');
    });
  });
});
