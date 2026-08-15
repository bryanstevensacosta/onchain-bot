import { DataSource } from 'typeorm';
import { PublishAdNowUseCase } from '../publish-ad-now.use-case';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { AdFormatPublisherService } from 'telegram/crypto-news-ads/application/services/ad-format-publisher.service';
import {
  Ad,
  type AdFormat,
} from 'telegram/crypto-news-ads/domain/entities/ad.entity';

describe('PublishAdNowUseCase', () => {
  const now = new Date('2026-08-15T00:00:00.000Z');

  const adRepo = {
    markPublished: jest.fn(),
    incrementFailures: jest.fn(),
    disable: jest.fn(),
  } as unknown as jest.Mocked<AdRepository>;
  const rotationStateRepo = {
    markAdPublished: jest.fn(),
  } as unknown as jest.Mocked<AdRotationStateRepository>;
  const sharedThrottle = {
    setLastPublishAt: jest.fn(),
  } as unknown as jest.Mocked<SharedThrottleSchedulerService>;
  const slotArbitrator = {
    recordPublish: jest.fn(),
  } as unknown as jest.Mocked<SlotArbitratorPort>;
  const adFormatPublisher = {
    publish: jest.fn(),
  } as unknown as jest.Mocked<AdFormatPublisherService>;
  const dataSource = {
    query: jest.fn(),
  } as unknown as jest.Mocked<Pick<DataSource, 'query'>>;

  let useCase: PublishAdNowUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new PublishAdNowUseCase(
      adRepo,
      rotationStateRepo,
      sharedThrottle,
      slotArbitrator,
      adFormatPublisher,
      dataSource as unknown as DataSource,
    );
  });

  /** Route `dataSource.query` by SQL: acquire → the given result, unlock → true. */
  function mockLock(acquired: boolean): void {
    (dataSource.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ acquired }]);
      }
      if (sql.includes('pg_advisory_unlock')) {
        return Promise.resolve([{ pg_advisory_unlock: true }]);
      }
      return Promise.resolve([]);
    });
  }

  function unlockCalls(): Array<readonly unknown[]> {
    return dataSource.query.mock.calls.filter((c) =>
      String(c[0]).includes('pg_advisory_unlock'),
    );
  }

  function expectUnlockCalledWithId(): void {
    const calls = unlockCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toEqual([8_013_203]);
  }

  function expectUnlockNotCalled(): void {
    expect(unlockCalls()).toHaveLength(0);
  }

  function ad(format: AdFormat, id: string): Ad {
    switch (format) {
      case 'photo':
        return Ad.create({
          id,
          name: `Ad ${id}`,
          body: 'body',
          format: 'photo',
          imageMediaId: 'media-1',
        });
      case 'video':
        return Ad.create({
          id,
          name: `Ad ${id}`,
          body: 'body',
          format: 'video',
          videoMediaId: 'media-2',
        });
      case 'album':
        return Ad.create({
          id,
          name: `Ad ${id}`,
          body: 'body',
          format: 'album',
          albumMediaIds: ['media-3', 'media-4'],
        });
      default:
        return Ad.create({
          id,
          name: `Ad ${id}`,
          body: 'body',
          format: 'text',
        });
    }
  }

  /** Mirrors PublishAdUseCase's four state transitions, in order. */
  function expectAllStateCalls(adId: string, messageId: string): void {
    expect(rotationStateRepo.markAdPublished).toHaveBeenCalledWith(adId, now);
    expect(sharedThrottle.setLastPublishAt).toHaveBeenCalledWith(now);
    expect(slotArbitrator.recordPublish).toHaveBeenCalledWith('ads', now);
    expect(adRepo.markPublished).toHaveBeenCalledWith(adId, messageId, now);
  }

  describe('happy path', () => {
    it('photo: publishes and registers all four state transitions', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: true,
        messageId: 42,
        error: null,
      });

      const result = await useCase.execute(ad('photo', 'ad-photo'), now);

      expect(result).toEqual({ ok: true, messageId: 42, error: null });
      expect(adFormatPublisher.publish).toHaveBeenCalledTimes(1);
      expectAllStateCalls('ad-photo', '42');
      expectUnlockCalledWithId();
    });

    it('video: publishes and returns the messageId', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: true,
        messageId: 43,
        error: null,
      });

      const result = await useCase.execute(ad('video', 'ad-video'), now);

      expect(result).toEqual({ ok: true, messageId: 43, error: null });
      expectAllStateCalls('ad-video', '43');
    });

    it('album: publishes and returns the messageId', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: true,
        messageId: 44,
        error: null,
      });

      const result = await useCase.execute(ad('album', 'ad-album'), now);

      expect(result).toEqual({ ok: true, messageId: 44, error: null });
      expectAllStateCalls('ad-album', '44');
    });

    it('text: publishes and returns the messageId', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: true,
        messageId: 45,
        error: null,
      });

      const result = await useCase.execute(ad('text', 'ad-text'), now);

      expect(result).toEqual({ ok: true, messageId: 45, error: null });
      expectAllStateCalls('ad-text', '45');
    });
  });

  describe('publisher failure', () => {
    it('returns the publisher error with NO state or failure bookkeeping', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'telegram down',
      });

      const result = await useCase.execute(ad('text', 'ad-text'), now);

      expect(result).toEqual({
        ok: false,
        messageId: null,
        error: 'telegram down',
      });
      expect(adRepo.markPublished).not.toHaveBeenCalled();
      expect(rotationStateRepo.markAdPublished).not.toHaveBeenCalled();
      expect(sharedThrottle.setLastPublishAt).not.toHaveBeenCalled();
      expect(slotArbitrator.recordPublish).not.toHaveBeenCalled();
      expect(adRepo.incrementFailures).not.toHaveBeenCalled();
      expect(adRepo.disable).not.toHaveBeenCalled();
      // release still happens in finally
      expectUnlockCalledWithId();
    });

    it('falls back to "unknown error" when the publisher returns no error', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: false,
        messageId: null,
        error: null,
      });

      const result = await useCase.execute(ad('text', 'ad-text'), now);

      expect(result).toEqual({
        ok: false,
        messageId: null,
        error: 'unknown error',
      });
      expect(adRepo.markPublished).not.toHaveBeenCalled();
    });
  });

  describe('advisory lock', () => {
    it('lock busy: returns an error and does NOT publish', async () => {
      mockLock(false);

      const result = await useCase.execute(ad('text', 'ad-text'), now);

      expect(result).toEqual({
        ok: false,
        messageId: null,
        error: 'another publish in progress',
      });
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
      expect(adRepo.markPublished).not.toHaveBeenCalled();
      // lock was never acquired → nothing to release
      expectUnlockNotCalled();
    });

    it('releases the advisory lock in finally after a publish', async () => {
      mockLock(true);
      adFormatPublisher.publish.mockResolvedValue({
        ok: true,
        messageId: 42,
        error: null,
      });

      await useCase.execute(ad('text', 'ad-text'), now);

      expectUnlockCalledWithId();
      expect(dataSource.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_unlock($1)',
        [8_013_203],
      );
    });
  });
});
