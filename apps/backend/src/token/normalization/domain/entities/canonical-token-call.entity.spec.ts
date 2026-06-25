import {
  CanonicalTokenCall,
  MentionInput,
} from 'token/normalization/domain/entities/canonical-token-call.entity';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';

const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';
const EVM_UPPER = '0xABCDEF0123456789ABCDEF0123456789ABCDEF01';

function buildMention(overrides: Partial<MentionInput> = {}): MentionInput {
  return {
    chain: ChainFamily.EVM,
    address: NormalizedAddress.fromEvm(EVM),
    ticker: 'PEPE',
    name: null,
    chart: null,
    metrics: TokenMetrics.empty(),
    confidence: 0.8,
    kolId: 'chan-A',
    username: 'SpyDefi',
    messageId: 1,
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('CanonicalTokenCall', () => {
  describe('create', () => {
    it('initializes with single source and mentionCount=1', () => {
      const call = CanonicalTokenCall.create(buildMention());
      expect(call.mentionCount).toBe(1);
      expect(call.sourceCount).toBe(1);
      expect(call.ticker).toBe('PEPE');
      expect(call.identity.key).toBe(`evm:${EVM}`);
    });
  });

  describe('mergeWith', () => {
    it('increments mentionCount when same source adds new message', () => {
      const call = CanonicalTokenCall.create(buildMention({ messageId: 1 }));
      const merged = call.mergeWith(buildMention({ messageId: 2 }));
      expect(merged.mentionCount).toBe(2);
      expect(merged.sourceCount).toBe(1);
      expect(merged.sources[0].messageIds).toEqual([1, 2]);
    });

    it('dedupes messageId in same source', () => {
      const call = CanonicalTokenCall.create(buildMention({ messageId: 1 }));
      const merged = call.mergeWith(buildMention({ messageId: 1 }));
      expect(merged.mentionCount).toBe(2); // still incremented
      expect(merged.sources[0].messageIds).toEqual([1]); // but not duplicated
    });

    it('adds a new source when different channel mentions the token', () => {
      const call = CanonicalTokenCall.create(buildMention({ kolId: 'chan-A' }));
      const merged = call.mergeWith(
        buildMention({ kolId: 'chan-B', messageId: 5 }),
      );
      expect(merged.mentionCount).toBe(2);
      expect(merged.sourceCount).toBe(2);
      expect(merged.sources.map((s) => s.kolId).sort()).toEqual([
        'chan-A',
        'chan-B',
      ]);
    });

    it('treats mixed-case EVM as same identity', () => {
      const call = CanonicalTokenCall.create(
        buildMention({ address: NormalizedAddress.fromEvm(EVM) }),
      );
      const merged = call.mergeWith(
        buildMention({ address: NormalizedAddress.fromEvm(EVM_UPPER) }),
      );
      expect(merged.mentionCount).toBe(2);
      expect(merged.sourceCount).toBe(1);
    });

    it('keeps firstSeenAt as min, lastSeenAt as max', () => {
      const t0 = new Date('2026-01-01T00:00:00Z');
      const t1 = new Date('2026-01-02T00:00:00Z');
      const t2 = new Date('2026-01-03T00:00:00Z');

      const call = CanonicalTokenCall.create(
        buildMention({ occurredAt: t1, messageId: 1 }),
      );
      const merged = call.mergeWith(
        buildMention({ occurredAt: t0, messageId: 2, kolId: 'chan-B' }),
      );
      const merged2 = merged.mergeWith(
        buildMention({ occurredAt: t2, messageId: 3, kolId: 'chan-C' }),
      );

      expect(merged2.firstSeenAt).toEqual(t0);
      expect(merged2.lastSeenAt).toEqual(t2);
    });

    it('replaces ticker with higher-confidence mention', () => {
      const call = CanonicalTokenCall.create(
        buildMention({ ticker: 'WRONG', confidence: 0.3 }),
      );
      const merged = call.mergeWith(
        buildMention({ ticker: 'RIGHT', confidence: 0.9, kolId: 'chan-B' }),
      );
      expect(merged.ticker).toBe('RIGHT');
    });

    it('replaces ticker with same-confidence but more-recent mention', () => {
      const t0 = new Date('2026-01-01T00:00:00Z');
      const t1 = new Date('2026-01-02T00:00:00Z');
      const call = CanonicalTokenCall.create(
        buildMention({ ticker: 'OLD', confidence: 0.5, occurredAt: t0 }),
      );
      const merged = call.mergeWith(
        buildMention({
          ticker: 'NEW',
          confidence: 0.5,
          occurredAt: t1,
          kolId: 'chan-B',
        }),
      );
      expect(merged.ticker).toBe('NEW');
    });

    it('keeps existing ticker when new mention has lower confidence', () => {
      const call = CanonicalTokenCall.create(
        buildMention({ ticker: 'GOOD', confidence: 0.9 }),
      );
      const merged = call.mergeWith(
        buildMention({ ticker: 'BAD', confidence: 0.2, kolId: 'chan-B' }),
      );
      expect(merged.ticker).toBe('GOOD');
    });

    it('keeps existing ticker when new mention has no ticker', () => {
      const call = CanonicalTokenCall.create(buildMention({ ticker: 'WIF' }));
      const merged = call.mergeWith(
        buildMention({ ticker: null, kolId: 'chan-B' }),
      );
      expect(merged.ticker).toBe('WIF');
    });

    it('takes new ticker when existing is null', () => {
      const call = CanonicalTokenCall.create(buildMention({ ticker: null }));
      const merged = call.mergeWith(
        buildMention({ ticker: 'NEW', kolId: 'chan-B' }),
      );
      expect(merged.ticker).toBe('NEW');
    });

    it('takes new name when existing is null', () => {
      const call = CanonicalTokenCall.create(buildMention({ name: null }));
      const merged = call.mergeWith(
        buildMention({ name: 'pepecoin', kolId: 'chan-B' }),
      );
      expect(merged.name).toBe('pepecoin');
    });

    it('takes new chart when existing is null', () => {
      const call = CanonicalTokenCall.create(buildMention({ chart: null }));
      const merged = call.mergeWith(
        buildMention({
          chart: 'https://dexscreener.com/x',
          kolId: 'chan-B',
        }),
      );
      expect(merged.chart).toBe('https://dexscreener.com/x');
    });

    it('merges metrics: prefers non-null per field', () => {
      const call = CanonicalTokenCall.create(
        buildMention({
          metrics: TokenMetrics.create({
            marketCapUsd: 100_000,
            liquidityUsd: null,
            fdvUsd: null,
            holders: null,
          }),
        }),
      );
      const merged = call.mergeWith(
        buildMention({
          metrics: TokenMetrics.create({
            marketCapUsd: null,
            liquidityUsd: 50_000,
            fdvUsd: null,
            holders: 1000,
          }),
          kolId: 'chan-B',
        }),
      );
      expect(merged.bestMetrics.marketCapUsd).toBe(100_000); // kept from existing
      expect(merged.bestMetrics.liquidityUsd).toBe(50_000); // from new
      expect(merged.bestMetrics.holders).toBe(1000); // from new
    });

    it('throws when merging mention with different identity', () => {
      const call = CanonicalTokenCall.create(buildMention());
      const otherIdentity = buildMention({
        address: NormalizedAddress.fromSolana(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ),
      });
      expect(() => call.mergeWith(otherIdentity)).toThrow();
    });
  });

  describe('emitNormalized', () => {
    it('emits a CallNormalizedEvent', () => {
      const call = CanonicalTokenCall.create(buildMention());
      call.emitNormalized();
      const events = call.commit();
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('normalization.call.normalized');
      const payload = events[0].toPayload() as {
        chain: string;
        address: string;
        mentionCount: number;
      };
      expect(payload.chain).toBe('evm');
      expect(payload.address).toBe(EVM);
      expect(payload.mentionCount).toBe(1);
    });
  });
});
