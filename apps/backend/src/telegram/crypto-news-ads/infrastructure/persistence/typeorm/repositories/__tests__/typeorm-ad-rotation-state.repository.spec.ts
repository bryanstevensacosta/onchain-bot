import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmAdRotationStateRepository } from '../typeorm-ad-rotation-state.repository';
import { AdRotationStateEntity } from '../../entities/ad-rotation-state.entity';

describe('TypeOrmAdRotationStateRepository', () => {
  let repo: TypeOrmAdRotationStateRepository;
  let mockRepo: jest.Mocked<
    Pick<Repository<AdRotationStateEntity>, 'findOne' | 'save'>
  >;
  let persisted: AdRotationStateEntity | null;

  beforeEach(async () => {
    persisted = null;
    mockRepo = {
      findOne: jest.fn().mockImplementation(async () => persisted),
      save: jest.fn().mockImplementation(async (row: AdRotationStateEntity) => {
        persisted = row;
        return row;
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmAdRotationStateRepository,
        {
          provide: getRepositoryToken(AdRotationStateEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    repo = moduleRef.get<TypeOrmAdRotationStateRepository>(
      TypeOrmAdRotationStateRepository,
    );
  });

  describe('load', () => {
    it('maps the singleton row (id=1)', async () => {
      persisted = {
        id: 1,
        postsSinceLastAd: 2,
        lastAdId: null,
        lastAdPublishedAt: null,
        updatedAt: new Date('2026-01-01T10:00:00Z'),
      };
      const state = await repo.load();
      expect(state.id).toBe(1);
      expect(state.postsSinceLastAd).toBe(2);
    });

    it('returns the empty state when the row is missing', async () => {
      const state = await repo.load();
      expect(state.postsSinceLastAd).toBe(0);
      expect(state.lastAdId).toBeNull();
    });
  });

  describe('incrementPostsSinceLastAd', () => {
    it('persists +1 across a full load→mutate→save cycle', async () => {
      persisted = {
        id: 1,
        postsSinceLastAd: 2,
        lastAdId: null,
        lastAdPublishedAt: null,
        updatedAt: new Date('2026-01-01T10:00:00Z'),
      };
      await repo.incrementPostsSinceLastAd();
      expect(persisted.postsSinceLastAd).toBe(3);
      const state = await repo.load();
      expect(state.postsSinceLastAd).toBe(3);
    });

    it('increments from the default 0 when no row exists yet', async () => {
      await repo.incrementPostsSinceLastAd();
      expect(persisted!.postsSinceLastAd).toBe(1);
    });
  });

  describe('resetPostsSinceLastAd', () => {
    it('sets postsSinceLastAd to 0', async () => {
      persisted = {
        id: 1,
        postsSinceLastAd: 5,
        lastAdId: 'ad-1',
        lastAdPublishedAt: new Date('2026-01-01T12:00:00Z'),
        updatedAt: new Date('2026-01-01T12:00:00Z'),
      };
      await repo.resetPostsSinceLastAd();
      expect(persisted.postsSinceLastAd).toBe(0);
    });
  });

  describe('markAdPublished', () => {
    it('records lastAdId, timestamp, and resets postsSinceLastAd', async () => {
      persisted = {
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: 'ad-1',
        lastAdPublishedAt: new Date('2026-01-01T12:00:00Z'),
        updatedAt: new Date('2026-01-01T12:00:00Z'),
      };
      const at = new Date('2026-01-01T13:00:00Z');
      await repo.markAdPublished('ad-2', at);
      expect(persisted.lastAdId).toBe('ad-2');
      expect(persisted.lastAdPublishedAt).toEqual(at);
      expect(persisted.postsSinceLastAd).toBe(0);
    });
  });
});
