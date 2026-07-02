/**
 * TryReserve / Finalize / MarkFailed branch coverage for VipCallsPublishUseCase.
 *
 * Encodes the four execution paths of the reserve-then-finalize publishing
 * flow. Every assertion also verifies that the publisher's `deleteMessage`
 * is NEVER called — the hard rule for this fix.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall } from 'telegram/shared';
import { InMemoryPublishedCallRepository } from '../../infrastructure/repositories/in-memory-published-call.repository';
import { VipCallsPublishUseCase } from './vip-calls-publish.use-case';
import type { TryReserveResult } from 'telegram/shared';

interface FakeFormatter {
  format: jest.Mock<string, [unknown]>;
}
function makeFormatter(returnValue: string): FakeFormatter {
  return { format: jest.fn().mockReturnValue(returnValue) };
}

interface FakePublisher {
  sendMessage: jest.Mock;
  deleteMessage: jest.Mock;
}
function makePublisher(result: {
  ok: boolean;
  messageId: number | null;
  error: string | null;
}): FakePublisher {
  return {
    sendMessage: jest.fn().mockResolvedValue(result),
    deleteMessage: jest.fn().mockResolvedValue({ ok: true }),
  };
}

interface FakeEventPublisher {
  publishAll: jest.Mock;
  publish: jest.Mock;
}
function makeEventPublisher(): FakeEventPublisher {
  return {
    publishAll: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  };
}

class FakeEventEmitter {
  emit = jest.fn();
}

class FakeSettings {
  scoringThresholds = { strong: 80, decent: 60, neutral: 40, risky: 20 };
  publishableChains = ['ethereum', 'solana'];
  async getScoringTierThresholds(): Promise<typeof this.scoringThresholds> {
    return this.scoringThresholds;
  }
  async getPublishableChains(): Promise<string[]> {
    return this.publishableChains;
  }
  async getTokenGateConfig(): Promise<{
    minScore: number;
    maxRiskWeight: number;
    minCompleteness: number;
    blockedClassifications: string[];
    enableBlacklist: boolean;
  }> {
    return {
      minScore: 50,
      maxRiskWeight: 100,
      minCompleteness: 0.3,
      blockedClassifications: ['SCAM', 'UNKNOWN'],
      enableBlacklist: true,
    };
  }
}

interface BuildOpts {
  formatter?: FakeFormatter;
  publisher?: FakePublisher;
  repo?: InMemoryPublishedCallRepository;
  eventPublisher?: FakeEventPublisher;
  eventEmitter?: FakeEventEmitter;
  settings?: FakeSettings;
}

function buildUseCase(opts: BuildOpts = {}) {
  const formatter = opts.formatter ?? makeFormatter('formatted-msg');
  const publisher =
    opts.publisher ?? makePublisher({ ok: true, messageId: 1014, error: null });
  const repo = opts.repo ?? new InMemoryPublishedCallRepository();
  const eventPublisher = opts.eventPublisher ?? makeEventPublisher();
  const eventEmitter = opts.eventEmitter ?? new FakeEventEmitter();
  const settings = opts.settings ?? new FakeSettings();
  const useCase = new VipCallsPublishUseCase(
    formatter as never,
    publisher,
    repo,
    eventPublisher,
    eventEmitter as unknown as EventEmitter2,
    settings as never,
  );
  return { useCase, formatter, publisher, repo, eventPublisher, eventEmitter };
}

const ETH_ADDRESS = '0xabcdEF1234567890abcdEF1234567890abcdEF12';

function spyOnRepo(repo: InMemoryPublishedCallRepository) {
  return {
    tryReserve: jest.spyOn(repo, 'tryReserve'),
    finalize: jest.spyOn(repo, 'finalize'),
    markFailed: jest.spyOn(repo, 'markFailed'),
  };
}

describe('VipCallsPublishUseCase — reserve-then-finalize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('(a) Fresh chain+address', () => {
    it('reserves, sends to Telegram, finalizes, and emits achievement event', async () => {
      const { useCase, publisher, repo, eventEmitter } = buildUseCase();
      const spies = spyOnRepo(repo);

      const result = await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
        marketCapUsd: 50_000,
      });

      expect(spies.tryReserve).toHaveBeenCalledTimes(1);
      const reserveArg = spies.tryReserve.mock.calls[0][0] as unknown as {
        chain: ChainId;
        address: string;
        targetChannels: ReadonlyArray<string>;
        correlationId: string;
      };
      expect(reserveArg.chain.value).toBe('ethereum');
      expect(reserveArg.address).toBe(ETH_ADDRESS);
      expect(reserveArg.targetChannels).toEqual(['vip-calls']);
      expect(reserveArg.correlationId).toMatch(/^pub-[0-9a-f-]{36}$/);

      expect(publisher.sendMessage).toHaveBeenCalledTimes(1);
      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'formatted-msg',
        undefined,
      );

      expect(spies.finalize).toHaveBeenCalledTimes(1);
      const finalizeArgs = spies.finalize.mock.calls[0] as [
        string,
        {
          status: string;
          telegramMessageId: number | null;
          failedReason?: string;
        },
      ];
      expect(finalizeArgs[0]).toBe(`ethereum:${ETH_ADDRESS.toLowerCase()}`);
      expect(finalizeArgs[1].status).toBe('PUBLISHED');
      expect(finalizeArgs[1].telegramMessageId).toBe(1014);
      expect(finalizeArgs[1].failedReason).toBeUndefined();

      expect(spies.markFailed).not.toHaveBeenCalled();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'achievement.register.call',
        expect.objectContaining({
          eventName: 'achievement.register.call',
          payload: expect.objectContaining({
            callId: `ethereum:${ETH_ADDRESS.toLowerCase()}`,
            chain: 'ethereum',
            address: ETH_ADDRESS.toLowerCase(),
            publishedAt: expect.any(String) as unknown,
          }) as unknown,
        }),
      );

      expect(publisher.deleteMessage).not.toHaveBeenCalled();

      expect(result.status).toBe('PUBLISHED');
      expect(result.publishedChannelIds).toEqual(['vip-calls']);
      expect(result.failedChannelIds).toEqual([]);
      expect(result.successCount).toBe(1);
    });

    it('emits achievement event when mcAtCall > 0', async () => {
      const { useCase, eventEmitter, publisher } = buildUseCase();
      await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
        marketCapUsd: 50_000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'achievement.register.call',
        expect.objectContaining({ eventName: 'achievement.register.call' }),
      );
      expect(publisher.deleteMessage).not.toHaveBeenCalled();
    });

    it('does NOT emit achievement event when mcAtCall is undefined', async () => {
      const { useCase, eventEmitter, publisher } = buildUseCase();
      await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(publisher.deleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('(b) Already reserved / already published', () => {
    it('skips sendMessage and returns output reflecting existing row', async () => {
      const seededRepo = new InMemoryPublishedCallRepository();
      const finalized = PublishedCall.create(
        {
          chain: ChainId.fromString('ethereum'),
          address: ETH_ADDRESS,
          ticker: 'TOKEN',
          score: 85,
          tier: 'STRONG',
          classification: 'GOOD',
          message: 'previously-published-msg',
          targetChannels: ['vip-calls'],
          mcAtCall: 50_000,
          telegramMessageId: 1014,
        },
        { published: ['vip-calls'], failed: [] },
      );
      await seededRepo.save(finalized);

      const { useCase, publisher, eventEmitter, eventPublisher } = buildUseCase(
        { repo: seededRepo },
      );
      const spies = spyOnRepo(seededRepo);

      const result = await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
        marketCapUsd: 50_000,
      });

      expect(spies.tryReserve).toHaveBeenCalledTimes(1);
      const tryReserveResult = (await spies.tryReserve.mock.results[0]
        .value) as TryReserveResult;
      expect(tryReserveResult.reserved).toBe(false);
      expect(tryReserveResult.existing?.id).toBe(
        `ethereum:${ETH_ADDRESS.toLowerCase()}`,
      );

      expect(publisher.sendMessage).not.toHaveBeenCalled();
      expect(spies.finalize).not.toHaveBeenCalled();
      expect(spies.markFailed).not.toHaveBeenCalled();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(eventPublisher.publishAll).not.toHaveBeenCalled();

      expect(publisher.deleteMessage).not.toHaveBeenCalled();

      expect(result.status).toBe('PUBLISHED');
      expect(result.message).toBe('previously-published-msg');
      expect(result.publishedChannelIds).toEqual(['vip-calls']);
      expect(result.successCount).toBe(1);
    });

    it('treats a still-RESERVED existing row as a duplicate (no second sendMessage)', async () => {
      const seededRepo = new InMemoryPublishedCallRepository();
      const reserved = PublishedCall.reserve({
        chain: ChainId.fromString('ethereum'),
        address: ETH_ADDRESS,
        ticker: 'TOKEN',
        score: 85,
        tier: 'STRONG',
        classification: 'GOOD',
        message: 'formatted-msg',
        targetChannels: ['vip-calls'],
        mcAtCall: 50_000,
        correlationId: 'pub-test-1',
      });
      await seededRepo.save(reserved);

      const { useCase, publisher, eventEmitter, eventPublisher } = buildUseCase(
        { repo: seededRepo },
      );
      const spies = spyOnRepo(seededRepo);

      await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
        marketCapUsd: 50_000,
      });

      expect(publisher.sendMessage).not.toHaveBeenCalled();
      expect(spies.finalize).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(eventPublisher.publishAll).not.toHaveBeenCalled();
      expect(publisher.deleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('(c) sendMessage throws', () => {
    it('calls markFailed, does NOT call finalize, re-throws original error', async () => {
      const publisher = makePublisher({
        ok: false,
        messageId: null,
        error: null,
      });
      const sendError = new Error('telegram rate limit');
      publisher.sendMessage.mockRejectedValueOnce(sendError);

      const repo = new InMemoryPublishedCallRepository();
      const { useCase, eventEmitter, eventPublisher } = buildUseCase({
        publisher,
        repo,
      });
      const spies = spyOnRepo(repo);

      await expect(
        useCase.execute({
          chain: 'ethereum',
          address: ETH_ADDRESS,
          score: 85,
          classification: 'GOOD',
          ticker: 'TOKEN',
          marketCapUsd: 50_000,
        }),
      ).rejects.toBe(sendError);

      expect(spies.tryReserve).toHaveBeenCalledTimes(1);
      const reservation = (await spies.tryReserve.mock.results[0]
        .value) as TryReserveResult;
      expect(reservation.reserved).toBe(true);
      expect(reservation.id).toBe(`ethereum:${ETH_ADDRESS.toLowerCase()}`);

      expect(spies.markFailed).toHaveBeenCalledTimes(1);
      const markFailedArgs = spies.markFailed.mock.calls[0];
      expect(markFailedArgs[0]).toBe(`ethereum:${ETH_ADDRESS.toLowerCase()}`);
      expect(markFailedArgs[1]).toMatch(/^sendMessage: /);
      expect(markFailedArgs[1]).toContain('telegram rate limit');

      expect(spies.finalize).not.toHaveBeenCalled();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(eventPublisher.publishAll).not.toHaveBeenCalled();

      expect(publisher.deleteMessage).not.toHaveBeenCalled();
    });

    it('still re-throws original sendError even if markFailed itself throws', async () => {
      const publisher = makePublisher({
        ok: false,
        messageId: null,
        error: null,
      });
      const sendError = new Error('boom');
      publisher.sendMessage.mockRejectedValueOnce(sendError);

      const repo = new InMemoryPublishedCallRepository();
      jest
        .spyOn(repo, 'markFailed')
        .mockRejectedValueOnce(new Error('markFailed boom'));

      const { useCase, publisher: pub } = buildUseCase({ publisher, repo });

      await expect(
        useCase.execute({
          chain: 'ethereum',
          address: ETH_ADDRESS,
          score: 85,
          classification: 'GOOD',
          ticker: 'TOKEN',
          marketCapUsd: 50_000,
        }),
      ).rejects.toBe(sendError);

      expect(pub.deleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('(d) finalize throws after sendMessage succeeds', () => {
    it('re-throws the finalize error and leaves the row RESERVED', async () => {
      const repo = new InMemoryPublishedCallRepository();
      const { useCase, publisher, eventEmitter, eventPublisher } = buildUseCase(
        { repo },
      );
      const spies = spyOnRepo(repo);
      const finalizeError = new Error('DB connection lost');
      spies.finalize.mockRejectedValueOnce(finalizeError);

      await expect(
        useCase.execute({
          chain: 'ethereum',
          address: ETH_ADDRESS,
          score: 85,
          classification: 'GOOD',
          ticker: 'TOKEN',
          marketCapUsd: 50_000,
        }),
      ).rejects.toBe(finalizeError);

      expect(spies.tryReserve).toHaveBeenCalledTimes(1);
      expect(publisher.sendMessage).toHaveBeenCalledTimes(1);
      expect(spies.finalize).toHaveBeenCalledTimes(1);
      expect(spies.markFailed).not.toHaveBeenCalled();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(eventPublisher.publishAll).not.toHaveBeenCalled();

      expect(publisher.deleteMessage).not.toHaveBeenCalled();

      const stored = await repo.findByChainAndAddress(
        ChainId.fromString('ethereum'),
        ETH_ADDRESS,
      );
      expect(stored).not.toBeNull();
      expect(stored?.isReserved).toBe(true);
      expect(stored?.telegramMessageId).toBeNull();
    });
  });

  describe('cross-cutting invariants', () => {
    it('never calls publisher.deleteMessage in any code path', async () => {
      const { useCase, publisher } = buildUseCase();
      await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
        marketCapUsd: 50_000,
      });
      expect(publisher.deleteMessage).not.toHaveBeenCalled();
    });

    it('tryReserve payload always carries correlationId and targetChannels=vip-calls', async () => {
      const { useCase, repo } = buildUseCase();
      const spies = spyOnRepo(repo);
      await useCase.execute({
        chain: 'ethereum',
        address: ETH_ADDRESS,
        score: 85,
        classification: 'GOOD',
        ticker: 'TOKEN',
        marketCapUsd: 50_000,
      });
      const arg = spies.tryReserve.mock.calls[0][0] as unknown as {
        correlationId: string;
        targetChannels: ReadonlyArray<string>;
      };
      expect(arg.correlationId).toMatch(/^pub-/);
      expect(arg.targetChannels).toEqual(['vip-calls']);
    });
  });
});
