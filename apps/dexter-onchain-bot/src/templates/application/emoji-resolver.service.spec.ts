import type { EmojiResolverPort } from '@/placeholders/application/template-renderer.service';
import { EmojiResolverService } from '@/templates/application/emoji-resolver.service';
import { EmojiMap } from '@/templates/domain/emoji-map.entity';
import {
  EmojiMapDuplicateError,
  EmojiMapValidationError,
} from '@/templates/domain/emoji-map.validators';
import { InMemoryEmojiMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-emoji-map.repository';

/** v1 `chain` matrix (seed-shaped rows; seeds themselves land in todo 9). */
const CHAIN_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['solana', '🟣'],
  ['ethereum', '🔷'],
  ['base', '🔵'],
  ['bsc', '🟡'],
  ['arbitrum', '🔵'],
  ['polygon', '🟪'],
  ['unknown', '⬜'],
];

const buildResolver = async (): Promise<EmojiResolverService> => {
  const repo = new InMemoryEmojiMapRepository();
  for (const [matchValue, emoji] of CHAIN_ROWS) {
    await repo.save(
      EmojiMap.create({ placeholderKey: 'chain', matchValue, emoji }),
    );
  }
  const resolver = new EmojiResolverService(repo);
  await resolver.refresh();
  return resolver;
};

describe('EmojiResolverService', () => {
  it('implements the placeholders-owned EmojiResolverPort', async () => {
    const resolver = await buildResolver();
    const port: EmojiResolverPort = resolver;
    expect(port.resolve('chain', 'solana')).toBe('🟣');
  });

  it('resolves the full chain matrix exactly', async () => {
    const resolver = await buildResolver();
    for (const [matchValue, emoji] of CHAIN_ROWS) {
      expect(resolver.resolve('chain', matchValue)).toBe(emoji);
    }
  });

  it('resolves case-insensitively with trim', async () => {
    const resolver = await buildResolver();
    expect(resolver.resolve('chain', 'Solana')).toBe(
      resolver.resolve('chain', 'solana'),
    );
    expect(resolver.resolve('chain', '  ETHEREUM  ')).toBe('🔷');
    expect(resolver.resolve('chain', 'BSC')).toBe('🟡');
  });

  it('falls back to "" for unknown values, keys and non-strings', async () => {
    const resolver = await buildResolver();
    expect(resolver.resolve('chain', 'ton')).toBe('');
    expect(resolver.resolve('chain', '')).toBe('');
    expect(resolver.resolve('tone', 'calm')).toBe('');
    expect(resolver.resolve('chain', undefined as unknown as string)).toBe('');
  });

  it('returns "" before any refresh (empty cache)', () => {
    const resolver = new EmojiResolverService(new InMemoryEmojiMapRepository());
    expect(resolver.resolve('chain', 'solana')).toBe('');
  });

  it('resolveAll snapshots every pair for a key', async () => {
    const resolver = await buildResolver();
    const all = resolver.resolveAll('chain');
    expect(all.size).toBe(CHAIN_ROWS.length);
    expect(all.get('solana')).toBe('🟣');
    expect(resolver.resolveAll('tone').size).toBe(0);
    // Defensive copy: mutating the snapshot never touches the cache.
    (all as Map<string, string>).clear();
    expect(resolver.resolve('chain', 'solana')).toBe('🟣');
  });

  it('surfaces duplicate pairs as domain errors, not raw failures', async () => {
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
          matchValue: 'solana',
          emoji: '🔷',
        }),
      ),
    ).rejects.toThrow(EmojiMapDuplicateError);
  });

  it('rejects empty emoji at the entity boundary', () => {
    expect(() =>
      EmojiMap.create({
        placeholderKey: 'chain',
        matchValue: 'ton',
        emoji: '',
      }),
    ).toThrow(EmojiMapValidationError);
  });

  it('picks up rows saved after a refresh on the next refresh', async () => {
    const repo = new InMemoryEmojiMapRepository();
    const resolver = new EmojiResolverService(repo);
    await resolver.refresh();
    expect(resolver.resolve('chain', 'ton')).toBe('');
    await repo.save(
      EmojiMap.create({
        placeholderKey: 'chain',
        matchValue: 'ton',
        emoji: '💎',
      }),
    );
    expect(resolver.resolve('chain', 'ton')).toBe('');
    await resolver.refresh();
    expect(resolver.resolve('chain', 'ton')).toBe('💎');
  });
});
