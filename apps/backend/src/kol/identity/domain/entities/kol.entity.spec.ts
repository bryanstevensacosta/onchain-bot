import { Kol } from './kol.entity';
import { KolId } from '../value-objects/kol-id.vo';
import { KolHandle } from '../value-objects/kol-handle.vo';

type KolLifecycleStatus = 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';

function makeKol(): Kol {
  return Kol.create({
    id: KolId.fromString('123'),
    handle: KolHandle.fromString('test_kol'),
    title: 'Test KOL',
  });
}

function getLifecycle(kol: Kol): KolLifecycleStatus {
  return (kol as unknown as { state: { lifecycleStatus: KolLifecycleStatus } })
    .state.lifecycleStatus;
}

function getIsActive(kol: Kol): boolean {
  return (kol as unknown as { state: { isActive: boolean } }).state.isActive;
}

describe('Kol lifecycle transitions', () => {
  describe('activate', () => {
    it('sets lifecycleStatus to ACTIVE', () => {
      const kol = makeKol();
      kol.dormant();
      kol.activate();
      expect(getLifecycle(kol)).toBe('ACTIVE');
    });

    it('restores isActive to true after dormant (INV-3 fix)', () => {
      const kol = makeKol();
      kol.dormant();
      expect(getIsActive(kol)).toBe(false);
      kol.activate();
      expect(getIsActive(kol)).toBe(true);
    });

    it('restores isActive to true after blacklist', () => {
      const kol = makeKol();
      kol.blacklist();
      expect(getIsActive(kol)).toBe(false);
      kol.activate();
      expect(getIsActive(kol)).toBe(true);
    });
  });

  describe('dormant', () => {
    it('sets lifecycleStatus to DORMANT and isActive to false', () => {
      const kol = makeKol();
      kol.dormant();
      expect(getLifecycle(kol)).toBe('DORMANT');
      expect(getIsActive(kol)).toBe(false);
    });
  });

  describe('blacklist', () => {
    it('sets lifecycleStatus to BLACKLISTED and isActive to false', () => {
      const kol = makeKol();
      kol.blacklist();
      expect(getLifecycle(kol)).toBe('BLACKLISTED');
      expect(getIsActive(kol)).toBe(false);
    });
  });
});
