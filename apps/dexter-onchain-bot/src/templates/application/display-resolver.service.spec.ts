import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';
import { DisplayResolverService } from '@/templates/application/display-resolver.service';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import {
  DisplayMapDuplicateError,
  DisplayMapValidationError,
} from '@/templates/domain/display-map.validators';
import { InMemoryDisplayMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-display-map.repository';

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

const buildResolver = async (): Promise<DisplayResolverService> => {
  const repo = new InMemoryDisplayMapRepository();
  for (const [matchValue, display] of CHAIN_ROWS) {
    await repo.save(
      DisplayMap.create({ placeholderKey: 'chain', matchValue, display }),
    );
  }
  const resolver = new DisplayResolverService(repo);
  await resolver.refresh();
  return resolver;
};

describe('DisplayResolverService', () => {
  it('implements the placeholders-owned DisplayResolverPort', async () => {
    const resolver = await buildResolver();
    const port: DisplayResolverPort = resolver;
    expect(port.resolve('chain', 'solana')).toBe('🟣');
  });

  it('resolves the full chain matrix exactly', async () => {
    const resolver = await buildResolver();
    for (const [matchValue, display] of CHAIN_ROWS) {
      expect(resolver.resolve('chain', matchValue)).toBe(display);
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
    const resolver = new DisplayResolverService(new InMemoryDisplayMapRepository());
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
          matchValue: 'solana',
          display: '🔷',
        }),
      ),
    ).rejects.toThrow(DisplayMapDuplicateError);
  });

  it('rejects empty display at the entity boundary', () => {
    expect(() =>
      DisplayMap.create({
        placeholderKey: 'chain',
        matchValue: 'ton',
        display: '',
      }),
    ).toThrow(DisplayMapValidationError);
  });

  it('picks up rows saved after a refresh on the next refresh', async () => {
    const repo = new InMemoryDisplayMapRepository();
    const resolver = new DisplayResolverService(repo);
    await resolver.refresh();
    expect(resolver.resolve('chain', 'ton')).toBe('');
    await repo.save(
      DisplayMap.create({
        placeholderKey: 'chain',
        matchValue: 'ton',
        display: '💎',
      }),
    );
    expect(resolver.resolve('chain', 'ton')).toBe('');
    await resolver.refresh();
    expect(resolver.resolve('chain', 'ton')).toBe('💎');
  });
});
