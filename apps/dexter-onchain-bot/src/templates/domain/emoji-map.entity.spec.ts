import { EmojiMap } from '@/templates/domain/emoji-map.entity';
import {
  EmojiMapDuplicateError,
  EmojiMapValidationError,
  MAX_EMOJI_GRAPHEMES,
  MAX_MATCH_VALUE_LENGTH,
  validateEmoji,
  validateMatchValue,
  validatePlaceholderKey,
} from '@/templates/domain/emoji-map.validators';
import { InMemoryEmojiMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-emoji-map.repository';

describe('EmojiMap entity', () => {
  it('creates a valid row with a generated uuid', () => {
    const map = EmojiMap.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    expect(map.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(map.placeholderKey).toBe('chain');
    expect(map.matchValue).toBe('solana');
    expect(map.emoji).toBe('🟣');
    expect(map.createdAt).toBeInstanceOf(Date);
  });

  it('normalizes matchValue to lowercase-trimmed form', () => {
    const map = EmojiMap.create({
      placeholderKey: 'chain',
      matchValue: '  Solana ',
      emoji: '🟣',
    });
    expect(map.matchValue).toBe('solana');
  });

  it('reconstitutes without re-validating stored rows', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const map = EmojiMap.reconstitute({
      id: 'row-1',
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
      createdAt,
    });
    expect(map.id).toBe('row-1');
    expect(map.createdAt).toBe(createdAt);
  });

  it('updates emoji and matchValue through validators', () => {
    const map = EmojiMap.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    map.updateEmoji('🔷');
    expect(map.emoji).toBe('🔷');
    map.updateMatchValue('Ethereum');
    expect(map.matchValue).toBe('ethereum');
    expect(() => map.updateEmoji('')).toThrow(EmojiMapValidationError);
  });

  it('rejects a placeholderKey outside the whitelist', () => {
    expect(() =>
      EmojiMap.create({
        placeholderKey: 'precio',
        matchValue: 'solana',
        emoji: '🟣',
      }),
    ).toThrow(EmojiMapValidationError);
    expect(() => validatePlaceholderKey('')).toThrow(EmojiMapValidationError);
    expect(() => validatePlaceholderKey(42)).toThrow(EmojiMapValidationError);
  });

  it('accepts derived placeholder keys from the whitelist', () => {
    expect(validatePlaceholderKey('chainEmoji')).toBe('chainEmoji');
    expect(validatePlaceholderKey('timeframe')).toBe('timeframe');
  });

  it('rejects empty and overlong matchValue', () => {
    expect(() => validateMatchValue('')).toThrow(EmojiMapValidationError);
    expect(() => validateMatchValue('   ')).toThrow(EmojiMapValidationError);
    expect(() =>
      validateMatchValue('x'.repeat(MAX_MATCH_VALUE_LENGTH + 1)),
    ).toThrow(EmojiMapValidationError);
    expect(validateMatchValue('x'.repeat(MAX_MATCH_VALUE_LENGTH))).toHaveLength(
      MAX_MATCH_VALUE_LENGTH,
    );
  });

  it('rejects empty and overlong emoji', () => {
    expect(() => validateEmoji('')).toThrow(EmojiMapValidationError);
    expect(() => validateEmoji('   ')).toThrow(EmojiMapValidationError);
    expect(() => validateEmoji('🟣'.repeat(MAX_EMOJI_GRAPHEMES + 1))).toThrow(
      EmojiMapValidationError,
    );
    expect(validateEmoji('🔵🌊')).toBe('🔵🌊');
  });
});

describe('InMemoryEmojiMapRepository', () => {
  it('round-trips CRUD sorted by key then value', async () => {
    const repo = new InMemoryEmojiMapRepository();
    await repo.save(
      EmojiMap.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        emoji: '🟣',
      }),
    );
    const second = EmojiMap.create({
      placeholderKey: 'chain',
      matchValue: 'base',
      emoji: '🔵',
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
    const repo = new InMemoryEmojiMapRepository();
    await repo.save(
      EmojiMap.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        emoji: '🟣',
      }),
    );
    await expect(
      repo.save(
        EmojiMap.create({
          placeholderKey: 'chain',
          matchValue: 'Solana',
          emoji: '🟣',
        }),
      ),
    ).rejects.toThrow(EmojiMapDuplicateError);
  });
});
