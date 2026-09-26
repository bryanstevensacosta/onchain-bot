import { ExtractionCandidate } from './extraction-candidate.entity';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { Ticker } from '../value-objects/ticker.vo';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function buildCandidate(index: number): ExtractionCandidate {
  return ExtractionCandidate.create({
    kolId: 'kol-9',
    messageId: 11,
    occurredAt: new Date('2026-09-24T12:00:00.000Z'),
    contractAddress: NormalizedAddress.fromEvm(USDC),
    contractIndex: index,
    tickers: [Ticker.fromString('USDC')],
    urls: [],
    handle: '@alpha',
    channelUrl: 'https://t.me/alpha',
    channelId: '-100123',
    channelTitle: 'Alpha',
  });
}

describe('ExtractionCandidate', () => {
  it('owns a deterministic db-id kolId:messageId:index', () => {
    expect(buildCandidate(2).id).toBe('kol-9:11:2');
  });

  it('rejects empty kolId and negative messageId/contractIndex', () => {
    const base = {
      kolId: 'kol-9',
      messageId: 11,
      occurredAt: new Date(),
      contractAddress: NormalizedAddress.fromEvm(USDC),
      contractIndex: 0,
      tickers: [],
      urls: [],
      handle: null,
      channelUrl: null,
      channelId: null,
      channelTitle: null,
    };
    expect(() => ExtractionCandidate.create({ ...base, kolId: '' })).toThrow(
      'kolId must not be empty',
    );
    expect(() =>
      ExtractionCandidate.create({ ...base, messageId: -1 }),
    ).toThrow('Invalid messageId: -1');
    expect(() =>
      ExtractionCandidate.create({ ...base, contractIndex: -1 }),
    ).toThrow('Invalid contractIndex: -1');
  });

  it('toSnapshotBase maps occurred_at_telegram and ingested_at_kol (no enriched_at)', () => {
    const candidate = buildCandidate(0);
    const now = new Date('2026-09-24T12:00:05.000Z');
    const base = candidate.toSnapshotBase(now);

    expect(base.mentionId).toBe(candidate.id);
    expect(base.kolId).toBe('kol-9');
    expect(base.messageId).toBe(11);
    expect(base.contractAddress).toBe(USDC.toLowerCase());
    expect(base.chainHint).toBe('evm');
    expect(base.occurred_at_telegram).toEqual(candidate.occurredAt);
    expect(base.ingested_at_kol).toEqual(now);
    expect('enriched_at' in base).toBe(false);
  });
});
