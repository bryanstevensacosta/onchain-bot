/**
 * Branch coverage for `ReconcileStuckReservationsUseCase`.
 *
 * Each scenario exercises a distinct reconciliation path so a regression
 * in any one branch fails loudly. The reconciler NEVER calls
 * `telegram.deleteMessage` — that hard invariant is exercised in
 * `vip-calls-publish.use-case.tryreserve.spec.ts`, but is preserved here
 * by construction (the reconciler only talks to `PublishedCallRepository`).
 */
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall, PublishStatus } from 'telegram/shared';
import { InMemoryPublishedCallRepository } from '../../infrastructure/repositories/in-memory-published-call.repository';
import { ReconcileStuckReservationsUseCase } from './reconcile-stuck-reservations.use-case';

interface FakeConfig {
  get: jest.Mock;
}
function makeConfig(enabled = true): FakeConfig {
  return {
    get: jest.fn((path: string) => {
      if (path === 'app.publishing.reconciliation.enabled') {
        return enabled;
      }
      return undefined;
    }),
  };
}

function buildUseCase(
  repo: InMemoryPublishedCallRepository,
  config: FakeConfig = makeConfig(),
) {
  return {
    useCase: new ReconcileStuckReservationsUseCase(repo, config as never),
    repo,
    config,
  };
}

const ETH_ADDRESS = '0xabcdEF1234567890abcdEF1234567890abcdEF12';
const ID = `ethereum:${ETH_ADDRESS.toLowerCase()}`;

function spyOnRepo(repo: InMemoryPublishedCallRepository) {
  return {
    findStuckReservations: jest.spyOn(repo, 'findStuckReservations'),
    finalize: jest.spyOn(repo, 'finalize'),
    markFailed: jest.spyOn(repo, 'markFailed'),
  };
}

describe('ReconcileStuckReservationsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('(a) Empty — no stuck rows', () => {
    it('returns processed=0, published=0, failed=0 when nothing is RESERVED', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const { useCase } = buildUseCase(repo);
      const findSpy = jest.spyOn(repo, 'findStuckReservations');

      const result = await useCase.execute({
        olderThanMs: 60_000,
        limit: 100,
      });

      expect(result).toEqual({ processed: 0, published: 0, failed: 0 });
      expect(findSpy).toHaveBeenCalledWith(60_000, 100);
    });

    it('ignores rows that are already PUBLISHED or FAILED', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const published = PublishedCall.create(
        {
          chain: ChainId.fromString('ethereum'),
          address: ETH_ADDRESS,
          ticker: 'TOKEN',
          score: 85,
          tier: 'STRONG',
          classification: 'GOOD',
          message: 'msg',
          targetChannels: ['vip-calls'],
          mcAtCall: 50_000,
          telegramMessageId: 1014,
        },
        { published: ['vip-calls'], failed: [] },
      );
      await repo.save(published);

      const { useCase } = buildUseCase(repo);

      const result = await useCase.execute({ olderThanMs: 60_000, limit: 100 });
      expect(result).toEqual({ processed: 0, published: 0, failed: 0 });
    });
  });

  describe('(b) Stuck RESERVED row with telegramMessageId already set', () => {
    it('finalizes to PUBLISHED and never calls markFailed', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const oldReservedAt = new Date(Date.now() - 5 * 60_000);
      const stuck = PublishedCall.rehydrate({
        id: ID,
        chain: ChainId.fromString('ethereum'),
        address: ETH_ADDRESS.toLowerCase(),
        ticker: 'TOKEN',
        score: 85,
        tier: 'STRONG',
        classification: 'GOOD',
        message: 'formatted-msg',
        targetChannels: ['vip-calls'],
        status: PublishStatus.RESERVED,
        publishedChannelIds: [],
        failedChannelIds: [],
        publishedAt: oldReservedAt,
        mcAtCall: 50_000,
        telegramMessageId: 1014,
        reservedAt: oldReservedAt,
        correlationId: 'pub-stuck-with-id',
        failedReason: null,
      });
      await repo.save(stuck);

      const { useCase } = buildUseCase(repo);
      const spies = spyOnRepo(repo);

      const result = await useCase.execute({
        olderThanMs: 60_000,
        limit: 100,
      });

      expect(result.processed).toBe(1);
      expect(result.published).toBe(1);
      expect(result.failed).toBe(0);

      expect(spies.finalize).toHaveBeenCalledTimes(1);
      const finalizeArgs = spies.finalize.mock.calls[0] as [
        string,
        {
          telegramMessageId: number | null;
          status: string;
        },
      ];
      expect(finalizeArgs[0]).toBe(ID);
      expect(finalizeArgs[1].telegramMessageId).toBe(1014);
      expect(finalizeArgs[1].status).toBe('PUBLISHED');
      expect(spies.markFailed).not.toHaveBeenCalled();

      const stored = await repo.findByChainAndAddress(
        ChainId.fromString('ethereum'),
        ETH_ADDRESS,
      );
      expect(stored?.isPublished).toBe(true);
      expect(stored?.telegramMessageId).toBe(1014);
    });
  });

  describe('(c) Stuck RESERVED row with telegramMessageId null', () => {
    it('marks the row FAILED with a reconciler reason and does NOT call finalize', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const oldReservedAt = new Date(Date.now() - 5 * 60_000);
      const stuck = PublishedCall.reserve({
        chain: ChainId.fromString('ethereum'),
        address: ETH_ADDRESS,
        ticker: 'TOKEN',
        score: 85,
        tier: 'STRONG',
        classification: 'GOOD',
        message: 'formatted-msg',
        targetChannels: ['vip-calls'],
        mcAtCall: 50_000,
        correlationId: 'pub-stuck-no-id',
      });
      Object.defineProperty(stuck, 'reservedAt', {
        value: oldReservedAt,
        configurable: true,
      });
      await repo.save(stuck);

      const { useCase } = buildUseCase(repo);
      const spies = spyOnRepo(repo);

      const result = await useCase.execute({
        olderThanMs: 60_000,
        limit: 100,
      });

      expect(result.processed).toBe(1);
      expect(result.published).toBe(0);
      expect(result.failed).toBe(1);

      expect(spies.markFailed).toHaveBeenCalledTimes(1);
      const markFailedArgs = spies.markFailed.mock.calls[0];
      expect(markFailedArgs[0]).toBe(ID);
      expect(markFailedArgs[1]).toContain('sendMessage never returned');

      expect(spies.finalize).not.toHaveBeenCalled();

      const stored = await repo.findByChainAndAddress(
        ChainId.fromString('ethereum'),
        ETH_ADDRESS,
      );
      expect(stored?.isFailed).toBe(true);
      expect(stored?.failedReason).toContain('reconciler');
    });
  });

  describe('(d) RESERVED row that is recent (not yet stuck)', () => {
    it('is filtered out by findStuckReservations so neither finalize nor markFailed runs', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const recent = PublishedCall.reserve({
        chain: ChainId.fromString('ethereum'),
        address: ETH_ADDRESS,
        ticker: 'TOKEN',
        score: 85,
        tier: 'STRONG',
        classification: 'GOOD',
        message: 'formatted-msg',
        targetChannels: ['vip-calls'],
        mcAtCall: 50_000,
        correlationId: 'pub-recent',
      });
      await repo.save(recent);

      const { useCase } = buildUseCase(repo);
      const spies = spyOnRepo(repo);

      const result = await useCase.execute({
        olderThanMs: 5 * 60_000,
        limit: 100,
      });

      expect(result).toEqual({ processed: 0, published: 0, failed: 0 });

      expect(spies.findStuckReservations).toHaveBeenCalledTimes(1);
      expect(spies.finalize).not.toHaveBeenCalled();
      expect(spies.markFailed).not.toHaveBeenCalled();

      const stored = await repo.findByChainAndAddress(
        ChainId.fromString('ethereum'),
        ETH_ADDRESS,
      );
      expect(stored?.isReserved).toBe(true);
    });
  });

  describe('(e) Idempotent — second tick on the same stuck row', () => {
    it('does not re-finalize an already-finalized row', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const oldReservedAt = new Date(Date.now() - 5 * 60_000);
      const stuck = PublishedCall.reserve({
        chain: ChainId.fromString('ethereum'),
        address: ETH_ADDRESS,
        ticker: 'TOKEN',
        score: 85,
        tier: 'STRONG',
        classification: 'GOOD',
        message: 'formatted-msg',
        targetChannels: ['vip-calls'],
        mcAtCall: 50_000,
        correlationId: 'pub-stuck-no-id',
      });
      Object.defineProperty(stuck, 'reservedAt', {
        value: oldReservedAt,
        configurable: true,
      });
      await repo.save(stuck);

      const { useCase } = buildUseCase(repo);
      const spies = spyOnRepo(repo);

      const first = await useCase.execute({
        olderThanMs: 60_000,
        limit: 100,
      });
      expect(first).toEqual({ processed: 1, published: 0, failed: 1 });

      spies.finalize.mockClear();
      spies.markFailed.mockClear();

      const second = await useCase.execute({
        olderThanMs: 60_000,
        limit: 100,
      });
      expect(second).toEqual({ processed: 0, published: 0, failed: 0 });
      expect(spies.finalize).not.toHaveBeenCalled();
      expect(spies.markFailed).not.toHaveBeenCalled();

      const stored = await repo.findByChainAndAddress(
        ChainId.fromString('ethereum'),
        ETH_ADDRESS,
      );
      expect(stored?.isFailed).toBe(true);
    });
  });

  describe('isEnabled() config flag', () => {
    it('defaults to enabled when config returns undefined', () => {
      const useCase = new ReconcileStuckReservationsUseCase(
        new InMemoryPublishedCallRepository(),
        makeConfig(true) as never,
      );
      expect(useCase.isEnabled()).toBe(true);
    });

    it('returns false when explicitly disabled', () => {
      const useCase = new ReconcileStuckReservationsUseCase(
        new InMemoryPublishedCallRepository(),
        makeConfig(false) as never,
      );
      expect(useCase.isEnabled()).toBe(false);
    });
  });
});
