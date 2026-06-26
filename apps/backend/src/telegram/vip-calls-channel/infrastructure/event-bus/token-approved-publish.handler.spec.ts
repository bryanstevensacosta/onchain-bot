/* eslint-disable @typescript-eslint/unbound-method */
import { TokenFilteredEvent } from 'token/token-gating/domain/events/token-filtered.event';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenSnapshotRepository } from 'chain/explorer/application/ports/token-snapshot.repository';
import { TokenApprovedPublishHandler } from './token-approved-publish.handler';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';

const SOL_ADDR = '4quuyzseunkbdwr3xqv83cqeb9enat348b9exbhgwory';

function makeEvent(): TokenFilteredEvent {
  return new TokenFilteredEvent({
    chain: 'solana',
    address: SOL_ADDR,
    score: 80,
    classification: 'GOOD',
    decidedAt: new Date(),
  });
}

function mockTokenRepo(): CanonicalTokenCallRepository {
  return {
    findByIdentity: jest.fn().mockResolvedValue(null),
  } as unknown as CanonicalTokenCallRepository;
}

function mockSnapshotRepo(): TokenSnapshotRepository {
  return {
    findByChainAndAddress: jest.fn().mockResolvedValue(null),
  } as unknown as TokenSnapshotRepository;
}

describe('TokenApprovedPublishHandler', () => {
  it('subscribes to filters.token.approved', () => {
    expect(TokenFilteredEvent.EVENT_NAME).toBe('filters.token.approved');
  });

  it('invokes publish.execute with chain, address, score, classification, and defaults for unknown ticker', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'call-1' });
    const handler = new TokenApprovedPublishHandler(
      { execute } as unknown as VipCallsPublishUseCase,
      mockTokenRepo(),
      mockSnapshotRepo(),
    );

    await handler.handle(makeEvent());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: SOL_ADDR,
      score: 80,
      classification: 'GOOD',
      ticker: null,
      name: null,
      marketCapUsd: null,
      liquidityUsd: null,
      holderCount: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
  });

  it('passes ticker and name from the canonical token when found', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'call-1' });
    const tokenRepo = {
      findByIdentity: jest.fn().mockResolvedValue({
        ticker: 'SOL',
        name: 'Solana Token',
        sources: [{ kolId: 'k1' }, { kolId: 'k2' }, { kolId: 'k3' }],
        mentionCount: 5,
      }),
    } as unknown as CanonicalTokenCallRepository;
    const handler = new TokenApprovedPublishHandler(
      { execute } as unknown as VipCallsPublishUseCase,
      tokenRepo,
      mockSnapshotRepo(),
    );

    await handler.handle(makeEvent());

    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: SOL_ADDR,
      score: 80,
      classification: 'GOOD',
      ticker: 'SOL',
      name: 'Solana Token',
      marketCapUsd: null,
      liquidityUsd: null,
      holderCount: null,
      sourceCount: 3,
      mentionCount: 5,
      chart: null,
    });
  });

  it('passes market metrics from canonical bestMetrics when snapshot is empty', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'call-1' });
    const tokenRepo = {
      findByIdentity: jest.fn().mockResolvedValue({
        ticker: 'SOL',
        bestMetrics: {
          marketCapUsd: 1_000_000,
          liquidityUsd: 500_000,
          holders: 2500,
        },
        sources: [{ kolId: 'k1' }, { kolId: 'k2' }],
        mentionCount: 4,
      }),
    } as unknown as CanonicalTokenCallRepository;
    const handler = new TokenApprovedPublishHandler(
      { execute } as unknown as VipCallsPublishUseCase,
      tokenRepo,
      mockSnapshotRepo(),
    );

    await handler.handle(makeEvent());

    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: SOL_ADDR,
      score: 80,
      classification: 'GOOD',
      ticker: 'SOL',
      name: null,
      marketCapUsd: 1_000_000,
      liquidityUsd: 500_000,
      holderCount: 2500,
      sourceCount: 2,
      mentionCount: 4,
      chart: null,
    });
  });

  it('prefers snapshot marketCapUsd over canonical bestMetrics when both exist', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'call-1' });
    const tokenRepo = {
      findByIdentity: jest.fn().mockResolvedValue({
        ticker: 'SOL',
        bestMetrics: { marketCapUsd: 999, liquidityUsd: 888, holders: 111 },
        sources: [],
        mentionCount: 1,
      }),
    } as unknown as CanonicalTokenCallRepository;
    const snapshotRepo = {
      findByChainAndAddress: jest.fn().mockResolvedValue({
        marketCapUsd: 1_500_000,
        liquidityUsd: null,
        holders: null,
        name: 'Solana Token (enriched)',
      }),
    } as unknown as TokenSnapshotRepository;
    const handler = new TokenApprovedPublishHandler(
      { execute } as unknown as VipCallsPublishUseCase,
      tokenRepo,
      snapshotRepo,
    );

    await handler.handle(makeEvent());

    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: SOL_ADDR,
      score: 80,
      classification: 'GOOD',
      ticker: 'SOL',
      name: 'Solana Token (enriched)',
      marketCapUsd: 1_500_000,
      liquidityUsd: 888,
      holderCount: 111,
      sourceCount: 0,
      mentionCount: 1,
      chart: null,
    });
  });

  it('swallows publish errors and logs warning (does not throw)', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('telegram down'));
    const handler = new TokenApprovedPublishHandler(
      { execute } as unknown as VipCallsPublishUseCase,
      mockTokenRepo(),
      mockSnapshotRepo(),
    );

    await expect(handler.handle(makeEvent())).resolves.toBeUndefined();
  });
});