import { DomainError } from '../../../shared/kernel/domain-error';
import { MentionSnapshot } from './mention-snapshot.entity';

const BASE = {
  mentionId: 'kol-a:1:0',
  kolId: 'kol-a',
  messageId: 1,
  contractIndex: 0,
  contractAddress: `0x${'a'.repeat(40)}`,
  chain: 'evm',
  occurred_at_telegram: new Date('2026-09-25T12:00:00.000Z'),
  ingested_at_kol: new Date('2026-09-25T12:00:05.000Z'),
  enriched_at: new Date('2026-09-25T12:00:06.000Z'),
};

describe('MentionSnapshot (P26: 4 timestamps, P27: owned by snapshot/)', () => {
  it('id defaults to mentionId; all 4 timestamps present', () => {
    const snapshot = MentionSnapshot.create(BASE);

    expect(snapshot.id).toBe('kol-a:1:0');
    expect(snapshot.occurred_at_telegram).toEqual(BASE.occurred_at_telegram);
    expect(snapshot.ingested_at_kol).toEqual(BASE.ingested_at_kol);
    expect(snapshot.enriched_at).toEqual(BASE.enriched_at);
    expect(snapshot.snapshot_at).toEqual(snapshot.enriched_at);
  });

  it('carries market fields incl. mc-at + rug-signal group', () => {
    const snapshot = MentionSnapshot.create({
      ...BASE,
      priceUsd: 1.5,
      marketCapUsd: 42000,
      lockedLiquidityPercent: 80,
      burnedPercent: 5,
      top10HolderPercent: 12,
    });

    expect(snapshot.priceUsd).toBe(1.5);
    expect(snapshot.marketCapUsd).toBe(42000);
    expect(snapshot.lockedLiquidityPercent).toBe(80);
    expect(snapshot.burnedPercent).toBe(5);
    expect(snapshot.top10HolderPercent).toBe(12);
    expect(snapshot.hasMarketData()).toBe(true);
  });

  it('all-null market -> hasMarketData() false (enrichment failed, row kept)', () => {
    const snapshot = MentionSnapshot.create(BASE);

    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.marketCapUsd).toBeNull();
    expect(snapshot.hasMarketData()).toBe(false);
  });

  it('missing occurred_at_telegram -> DomainError', () => {
    expect(() =>
      MentionSnapshot.create({
        ...BASE,
        occurred_at_telegram: null as unknown as Date,
      }),
    ).toThrow(DomainError);
  });

  it('missing enriched_at -> DomainError (snapshot_at derives from it)', () => {
    expect(() =>
      MentionSnapshot.create({
        ...BASE,
        enriched_at: null as unknown as Date,
      }),
    ).toThrow(DomainError);
  });
});
