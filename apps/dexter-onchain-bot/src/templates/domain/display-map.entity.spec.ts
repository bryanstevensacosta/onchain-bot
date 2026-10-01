import { DisplayMap } from '@/templates/domain/display-map.entity';
import {
  DisplayMapDuplicateError,
  DisplayMapValidationError,
  MAX_DISPLAY_LENGTH,
  MAX_MATCH_VALUE_LENGTH,
  validateDisplay,
  validateMatchValue,
  validatePlaceholderKey,
} from '@/templates/domain/display-map.validators';
import { InMemoryDisplayMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-display-map.repository';

describe('DisplayMap entity', () => {
  it('creates a valid row with a generated uuid', () => {
    const map = DisplayMap.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      display: '🟣',
    });
    expect(map.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(map.placeholderKey).toBe('chain');
    expect(map.matchValue).toBe('solana');
    expect(map.display).toBe('🟣');
    expect(map.createdAt).toBeInstanceOf(Date);
  });

  it('normalizes matchValue to lowercase-trimmed form', () => {
    const map = DisplayMap.create({
      placeholderKey: 'chain',
      matchValue: '  Solana ',
      display: '🟣',
    });
    expect(map.matchValue).toBe('solana');
  });

  it('reconstitutes without re-validating stored rows', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const map = DisplayMap.reconstitute({
      id: 'row-1',
      placeholderKey: 'chain',
      matchValue: 'solana',
      display: '🟣',
      createdAt,
    });
    expect(map.id).toBe('row-1');
    expect(map.createdAt).toBe(createdAt);
  });

  it('updates display and matchValue through validators', () => {
    const map = DisplayMap.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      display: '🟣',
    });
    map.updateDisplay('🔷');
    expect(map.display).toBe('🔷');
    map.updateMatchValue('Ethereum');
    expect(map.matchValue).toBe('ethereum');
    expect(() => map.updateDisplay('')).toThrow(DisplayMapValidationError);
  });

  it('rejects a placeholderKey outside the whitelist', () => {
    expect(() =>
      DisplayMap.create({
        placeholderKey: 'precio',
        matchValue: 'solana',
        display: '🟣',
      }),
    ).toThrow(DisplayMapValidationError);
    expect(() => validatePlaceholderKey('')).toThrow(DisplayMapValidationError);
    expect(() => validatePlaceholderKey(42)).toThrow(DisplayMapValidationError);
  });

  it('accepts derived placeholder keys from the whitelist', () => {
    expect(validatePlaceholderKey('chainDisplay')).toBe('chainDisplay');
    expect(validatePlaceholderKey('timeframe')).toBe('timeframe');
  });

  it('rejects empty and overlong matchValue', () => {
    expect(() => validateMatchValue('')).toThrow(DisplayMapValidationError);
    expect(() => validateMatchValue('   ')).toThrow(DisplayMapValidationError);
    expect(() =>
      validateMatchValue('x'.repeat(MAX_MATCH_VALUE_LENGTH + 1)),
    ).toThrow(DisplayMapValidationError);
    expect(validateMatchValue('x'.repeat(MAX_MATCH_VALUE_LENGTH))).toHaveLength(
      MAX_MATCH_VALUE_LENGTH,
    );
  });

  it('rejects empty and overlong display', () => {
    expect(() => validateDisplay('')).toThrow(DisplayMapValidationError);
    expect(() => validateDisplay('   ')).toThrow(DisplayMapValidationError);
    expect(() =>
      validateDisplay('x'.repeat(MAX_DISPLAY_LENGTH + 1)),
    ).toThrow(DisplayMapValidationError);
    expect(validateDisplay('x'.repeat(MAX_DISPLAY_LENGTH))).toHaveLength(
      MAX_DISPLAY_LENGTH,
    );
  });

  it('accepts display text, emoji, and mixed forms', () => {
    expect(validateDisplay('SOL')).toBe('SOL');
    expect(validateDisplay('🟣')).toBe('🟣');
    expect(validateDisplay('🟣 SOL')).toBe('🟣 SOL');
    expect(validateDisplay('  SOL  ')).toBe('SOL');
    expect(() => validateDisplay('x'.repeat(41))).toThrow(
      DisplayMapValidationError,
    );
  });
});

describe('InMemoryDisplayMapRepository', () => {
  it('round-trips CRUD sorted by key then value', async () => {
    const repo = new InMemoryDisplayMapRepository();
    await repo.save(
      DisplayMap.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        display: '🟣',
      }),
    );
    const second = DisplayMap.create({
      placeholderKey: 'chain',
      matchValue: 'base',
      display: '🔵',
    });
    await repo.save(second);

    expect((await repo.findAll()).map((m) => m.matchValue)).toEqual([
      'base',
      'solana',
    ]);
    expect((await repo.findByKey('chain')).map((m) => m.matchValue)).toEqual([
      'base',
      'solana',
    ]);
    expect(await repo.findByKey('tone')).toEqual([]);
    expect(await repo.findOne(second.id)).toBe(second);
    expect(await repo.findOne('missing')).toBeNull();

    expect(await repo.delete(second.id)).toBe(true);
    expect(await repo.delete(second.id)).toBe(false);
    expect(await repo.findOne(second.id)).toBeNull();
  });

  it('rejects a duplicate (placeholderKey, matchValue) pair', async () => {
    const repo = new InMemoryDisplayMapRepository();
    await repo.save(
      DisplayMap.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        display: '🟣',
      }),
    );
    await expect(
      repo.save(
        DisplayMap.create({
          placeholderKey: 'chain',
          matchValue: 'Solana',
          display: '🟣',
        }),
      ),
    ).rejects.toThrow(DisplayMapDuplicateError);
  });
});
