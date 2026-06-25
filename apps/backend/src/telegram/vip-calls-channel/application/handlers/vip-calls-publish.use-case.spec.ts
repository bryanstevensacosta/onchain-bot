/* eslint-disable @typescript-eslint/unbound-method */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChainId } from 'chain/identity/chain-id.vo';
import { InMemoryPublishedCallRepository } from '../../infrastructure/repositories/in-memory-published-call.repository';
import { VipCallsPublishUseCase } from './vip-calls-publish.use-case';

interface FakeFormatter {
  format: jest.Mock;
}
function makeFormatter(returnValue: string): FakeFormatter {
  return { format: jest.fn().mockReturnValue(returnValue) };
}

interface FakePublisher {
  sendMessage: jest.Mock;
}
function makePublisher(
  result: {
    ok: boolean;
    messageId: number | null;
    error: string | null;
  },
): FakePublisher {
  return { sendMessage: jest.fn().mockResolvedValue(result) };
}

interface FakeEventPublisher {
  publishAll: jest.Mock;
}
function makeEventPublisher(): FakeEventPublisher {
  return { publishAll: jest.fn().mockResolvedValue(undefined) };
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

function buildUseCase(
  overrides: {
    formatter?: FakeFormatter;
    publisher?: FakePublisher;
    repo?: InMemoryPublishedCallRepository;
    eventPublisher?: FakeEventPublisher;
    eventEmitter?: FakeEventEmitter;
    settings?: FakeSettings;
  } = {},
) {
  const formatter = overrides.formatter ?? makeFormatter('formatted-msg');
  const publisher =
    overrides.publisher ?? makePublisher({ ok: true, messageId: 42, error: null });
  const repo = overrides.repo ?? new InMemoryPublishedCallRepository();
  const eventPublisher =
    overrides.eventPublisher ?? makeEventPublisher();
  const eventEmitter = overrides.eventEmitter ?? new FakeEventEmitter();
  const settings = overrides.settings ?? new FakeSettings();
  const useCase = new VipCallsPublishUseCase(
    formatter as never,
    publisher as never,
    repo,
    eventPublisher as never,
    eventEmitter as unknown as EventEmitter2,
    settings as never,
  );
  return { useCase, formatter, publisher, repo, eventPublisher, eventEmitter, settings };
}

describe('VipCallsPublishUseCase', () => {
  describe('happy path', () => {
    it('formats the message via the formatter and sends via publisher', async () => {
      const { useCase, formatter, publisher } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'TokenMint123',
        score: 85,
        classification: 'GOOD',
        ticker: 'PEPE',
      });

      expect(formatter.format).toHaveBeenCalledTimes(1);
      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'formatted-msg',
        undefined,
      );
    });

    it('passes input fields to formatter (with defaults)', async () => {
      const { useCase, formatter } = buildUseCase();
      await useCase.execute({
        chain: 'ethereum',
        address: '0xABC',
        score: 70,
        classification: 'NEUTRAL',
      });

      const arg = formatter.format.mock.calls[0][0];
      expect(arg).toEqual({
        chain: 'ethereum',
        address: '0xABC',
        ticker: null,
        name: null,
        score: 70,
        classification: 'NEUTRAL',
        marketCapUsd: null,
        liquidityUsd: null,
        holders: null,
        sourceCount: 1,
        mentionCount: 1,
        chart: null,
        imageUrls: [],
      });
    });

    it('saves the published call via the repo', async () => {
      const { useCase, repo } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'TokenMint123',
        score: 85,
        classification: 'GOOD',
      });

      const saved = await repo.findByChainAndAddress(
        ChainId.fromString('solana'),
        'TokenMint123',
      );
      expect(saved).not.toBeNull();
      expect(saved?.tier).toBe('STRONG');
      expect(saved?.score).toBe(85);
    });

    it('publishes the publishing event via PublishingEventPublisher', async () => {
      const { useCase, eventPublisher } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'TokenMint123',
        score: 85,
        classification: 'GOOD',
      });

      expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    });

    it('emits the RegisterCallForMilestonesEvent when mcAtCall > 0', async () => {
      const { useCase, eventEmitter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'TokenMint123',
        score: 85,
        classification: 'GOOD',
        marketCapUsd: 50000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'milestone.register.call',
        expect.objectContaining({
          eventName: 'milestone.register.call',
          payload: expect.objectContaining({
            callId: expect.any(String),
            chain: 'solana',
            address: 'TokenMint123',
            mcAtCall: 50000,
          }),
        }),
      );
    });
  });

  describe('mcAtCall handling', () => {
    it('uses input.marketCapUsd as mcAtCall when > 0', async () => {
      const { useCase, eventEmitter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'abc',
        score: 80,
        classification: 'GOOD',
        marketCapUsd: 125000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'milestone.register.call',
        expect.objectContaining({
          payload: expect.objectContaining({ mcAtCall: 125000 }),
        }),
      );
    });

    it('does NOT emit RegisterCallForMilestonesEvent when marketCapUsd is undefined', async () => {
      const { useCase, eventEmitter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'abc',
        score: 80,
        classification: 'GOOD',
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit RegisterCallForMilestonesEvent when marketCapUsd is 0', async () => {
      const { useCase, eventEmitter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'abc',
        score: 80,
        classification: 'GOOD',
        marketCapUsd: 0,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit RegisterCallForMilestonesEvent when marketCapUsd is negative', async () => {
      const { useCase, eventEmitter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'abc',
        score: 80,
        classification: 'GOOD',
        marketCapUsd: -1,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('publish failure', () => {
    it('records failedChannelIds=["vip-calls"] when sendMessage fails', async () => {
      const publisher = makePublisher({
        ok: false,
        messageId: null,
        error: 'Bad Request',
      });
      const { useCase, repo } = buildUseCase({ publisher });
      const output = await useCase.execute({
        chain: 'solana',
        address: 'abc',
        score: 80,
        classification: 'GOOD',
        marketCapUsd: 50000,
      });

      expect(output.status).toBe('FAILED');
      expect(output.failedChannelIds).toEqual(['vip-calls']);
      expect(output.publishedChannelIds).toEqual([]);
      expect(output.successCount).toBe(0);

      const saved = await repo.findByChainAndAddress(
        ChainId.fromString('solana'),
        'abc',
      );
      expect(saved?.isFailed).toBe(true);
      expect(saved?.isPublished).toBe(false);
    });

    it('does NOT emit RegisterCallForMilestonesEvent when publish failed (only published calls are monitored)', async () => {
      const publisher = makePublisher({
        ok: false,
        messageId: null,
        error: 'Bad Request',
      });
      const { useCase, eventEmitter } = buildUseCase({ publisher });
      await useCase.execute({
        chain: 'solana',
        address: 'abc',
        score: 80,
        classification: 'GOOD',
        marketCapUsd: 50000,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('tier calculation', () => {
    it('computes STRONG tier for score >= 80', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 95,
        classification: 'GOOD',
      });
      expect(out.tier).toBe('STRONG');
    });

    it('computes DECENT tier for score in [60, 80)', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 70,
        classification: 'GOOD',
      });
      expect(out.tier).toBe('DECENT');
    });

    it('computes NEUTRAL tier for score in [40, 60)', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 50,
        classification: 'GOOD',
      });
      expect(out.tier).toBe('NEUTRAL');
    });

    it('computes RISKY tier for score in [20, 40)', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 30,
        classification: 'GOOD',
      });
      expect(out.tier).toBe('RISKY');
    });

    it('computes AVOID tier for score < 20', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 10,
        classification: 'SCAM',
      });
      expect(out.tier).toBe('AVOID');
    });

    it('uses thresholds from SettingsService.getScoringTierThresholds', async () => {
      const settings = new FakeSettings();
      settings.scoringThresholds = {
        strong: 90,
        decent: 70,
        neutral: 50,
        risky: 30,
      };
      const { useCase } = buildUseCase({ settings });
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 75,
        classification: 'GOOD',
      });
      expect(out.tier).toBe('DECENT');
    });
  });

  describe('output shape', () => {
    it('returns successCount=1 + publishedChannelIds=["vip-calls"] on success', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'TokenMint',
        score: 85,
        classification: 'GOOD',
      });
      expect(out.successCount).toBe(1);
      expect(out.publishedChannelIds).toEqual(['vip-calls']);
      expect(out.failedChannelIds).toEqual([]);
    });

    it('returns publishedAt as ISO string', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
      });
      expect(out.publishedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it('returns headerImageUrl = first imageUrl when provided', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
        imageUrls: ['https://x/a.png', 'https://x/b.png'],
      });
      expect(out.headerImageUrl).toBe('https://x/a.png');
    });

    it('returns headerImageUrl = null when no imageUrls', async () => {
      const { useCase } = buildUseCase();
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
      });
      expect(out.headerImageUrl).toBeNull();
    });

    it('returns the formatted message in output', async () => {
      const formatter = makeFormatter('hello world');
      const { useCase } = buildUseCase({ formatter });
      const out = await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
      });
      expect(out.message).toBe('hello world');
    });

    it('passes the first imageUrl to publisher.sendMessage as image', async () => {
      const { useCase, publisher } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
        imageUrls: ['https://x/header.png', 'https://x/extra.png'],
      });

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'formatted-msg',
        'https://x/header.png',
      );
    });
  });

  describe('input defaults', () => {
    it('defaults sourceCount=1 and mentionCount=1 when not provided', async () => {
      const { useCase, formatter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
      });
      const arg = formatter.format.mock.calls[0][0];
      expect(arg.sourceCount).toBe(1);
      expect(arg.mentionCount).toBe(1);
    });

    it('preserves explicit sourceCount + mentionCount', async () => {
      const { useCase, formatter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
        sourceCount: 5,
        mentionCount: 12,
      });
      const arg = formatter.format.mock.calls[0][0];
      expect(arg.sourceCount).toBe(5);
      expect(arg.mentionCount).toBe(12);
    });

    it('passes ticker through to formatter', async () => {
      const { useCase, formatter } = buildUseCase();
      await useCase.execute({
        chain: 'solana',
        address: 'a',
        score: 80,
        classification: 'GOOD',
        ticker: 'PEPE2',
      });
      const arg = formatter.format.mock.calls[0][0];
      expect(arg.ticker).toBe('PEPE2');
    });
  });
});