import { KolKnownListRepository } from 'kol/reputation/application/ports/kol-known-list.repository';
import { DbBackedKnownKolRegistry } from 'kol/reputation/infrastructure/known-kol/db-backed-known-kol.registry';

class FakeKolKnownListRepository extends KolKnownListRepository {
  constructor(
    private readonly good: ReadonlyArray<string>,
    private readonly bad: ReadonlyArray<string>,
  ) {
    super();
  }
  public override async isKnown(
    kolId: string,
    kind: 'GOOD' | 'BAD',
  ): Promise<boolean> {
    const list = kind === 'GOOD' ? this.good : this.bad;
    return list.includes(kolId);
  }
  public override async list(
    kind: 'GOOD' | 'BAD',
  ): Promise<
    ReadonlyArray<{ kolId: string; reason: string | null; addedAt: Date }>
  > {
    const list = kind === 'GOOD' ? this.good : this.bad;
    return list.map((id) => ({
      kolId: id,
      reason: null,
      addedAt: new Date('2026-01-01T00:00:00Z'),
    }));
  }
}

describe('DbBackedKnownKolRegistry', () => {
  it('returns the default GOOD score when the KOL is in the GOOD list', async () => {
    const repo = new FakeKolKnownListRepository(['spydefi'], []);
    const reg = new DbBackedKnownKolRegistry(repo);
    expect(await reg.getGoodScore('spydefi')).toBe(0.9);
  });

  it('returns null when the KOL is not in the GOOD list', async () => {
    const repo = new FakeKolKnownListRepository(['spydefi'], []);
    const reg = new DbBackedKnownKolRegistry(repo);
    expect(await reg.getGoodScore('unknown-kol')).toBeNull();
  });

  it('returns true from isBad when KOL is in the BAD list', async () => {
    const repo = new FakeKolKnownListRepository([], ['scammer42']);
    const reg = new DbBackedKnownKolRegistry(repo);
    expect(await reg.isBad('scammer42')).toBe(true);
  });

  it('returns false from isBad when KOL is not in the BAD list', async () => {
    const repo = new FakeKolKnownListRepository(['spydefi'], ['scammer42']);
    const reg = new DbBackedKnownKolRegistry(repo);
    expect(await reg.isBad('spydefi')).toBe(false);
  });

  it('isBad takes precedence over GOOD (BAD row exists → isBad=true)', async () => {
    const repo = new FakeKolKnownListRepository(['dupe'], ['dupe']);
    const reg = new DbBackedKnownKolRegistry(repo);
    expect(await reg.isBad('dupe')).toBe(true);
    expect(await reg.getGoodScore('dupe')).toBe(0.9);
  });
});