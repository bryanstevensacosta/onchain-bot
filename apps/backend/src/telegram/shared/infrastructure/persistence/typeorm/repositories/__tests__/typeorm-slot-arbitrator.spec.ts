import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { TypeOrmSlotArbitrator } from '../typeorm-slot-arbitrator';
import { PublisherSlotStateEntity } from '../../entities/publisher-slot-state.entity';

describe('TypeOrmSlotArbitrator', () => {
  let arbitrator: TypeOrmSlotArbitrator;
  let mockRepo: jest.Mocked<
    Pick<Repository<PublisherSlotStateEntity>, 'findOne' | 'save'>
  >;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const dataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepo),
    } as unknown as DataSource;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmSlotArbitrator,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    arbitrator = moduleRef.get<TypeOrmSlotArbitrator>(TypeOrmSlotArbitrator);
  });

  describe('canPublishNow', () => {
    it('allows publish when no prior publish exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const decision = await arbitrator.canPublishNow('news', new Date());
      expect(decision).toMatchObject({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
    });

    it('allows publish when the min gap has elapsed', async () => {
      const last = new Date('2026-01-01T12:00:00Z');
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        lastScope: 'news',
        lastPublishAt: last,
        minSecondsBetweenSlots: 60,
        updatedAt: last,
      });
      const now = new Date('2026-01-01T12:01:01Z');
      const decision = await arbitrator.canPublishNow('ads', now);
      expect(decision).toMatchObject({
        canPublish: true,
        remainingSeconds: 0,
        lastScope: 'news',
        reason: 'ok',
      });
    });

    it('blocks publish within the min gap and reports the next slot', async () => {
      const last = new Date('2026-01-01T12:00:00Z');
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        lastScope: 'ads',
        lastPublishAt: last,
        minSecondsBetweenSlots: 60,
        updatedAt: last,
      });
      const now = new Date('2026-01-01T12:00:30Z');
      const decision = await arbitrator.canPublishNow('news', now);
      expect(decision).toMatchObject({
        canPublish: false,
        lastScope: 'ads',
        reason: 'min-gap-not-met',
      });
      expect(decision.remainingSeconds).toBe(30);
      expect(decision.nextSlotAvailableAt).toEqual(
        new Date('2026-01-01T12:01:00Z'),
      );
    });

    it('cross-scope: a news publish just posted blocks ads', async () => {
      const last = new Date('2026-01-01T12:00:00Z');
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        lastScope: 'news',
        lastPublishAt: last,
        minSecondsBetweenSlots: 60,
        updatedAt: last,
      });
      const decision = await arbitrator.canPublishNow(
        'ads',
        new Date('2026-01-01T12:00:10Z'),
      );
      expect(decision.canPublish).toBe(false);
    });
  });

  describe('recordPublish', () => {
    it('persists the scope and timestamp on the singleton row', async () => {
      const at = new Date('2026-01-01T12:00:00Z');
      await arbitrator.recordPublish('news', at);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          lastScope: 'news',
          lastPublishAt: at,
        }),
      );
    });
  });
});
