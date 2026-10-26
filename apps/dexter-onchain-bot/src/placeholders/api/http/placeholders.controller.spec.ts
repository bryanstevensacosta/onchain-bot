import { NotFoundException } from '@nestjs/common';
import { TEMPLATE_COMMANDS } from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from './placeholders.controller';

const statusOf = async (run: () => Promise<unknown>): Promise<number> => {
  try {
    await run();
  } catch (error) {
    const status = (error as { getStatus?: () => number }).getStatus;
    if (typeof status === 'function') {
      return (error as { getStatus: () => number }).getStatus();
    }
    throw error;
  }
  throw new Error('expected the call to throw');
};

describe('PlaceholdersController (todo 7 placeholder catalog)', () => {
  it('GET ca lists ≥22 keys incl. the derived {{chainDisplay}}', () => {
    const controller = new PlaceholdersController();
    const view = controller.list('ca');
    expect(view.command).toBe('ca');
    expect(view.placeholders.length).toBeGreaterThanOrEqual(22);
    const keys = view.placeholders.map((entry) => entry.key);
    expect(keys).toContain('symbol');
    expect(keys).toContain('chainDisplay');
    expect(keys).not.toContain('chainEmoji');
    expect(keys).not.toContain('timeframe');
    for (const key of [
      'launchpadText',
      'launchpadTextLink',
      'launchpadIcon',
      'launchpadIconLink',
    ]) {
      expect(keys).toContain(key);
      const entry = view.placeholders.find((row) => row.key === key);
      expect(entry?.type).toBe('derived');
      expect(entry?.example).not.toBe('');
    }
    for (const entry of view.placeholders) {
      expect(entry.key).toEqual(expect.any(String));
      expect(entry.type).toEqual(expect.any(String));
      expect(typeof entry.nullable).toBe('boolean');
      expect(entry.example).toEqual(expect.any(String));
    }
  });

  it('GET c includes timeframe; GET bare matches ca minus timeframe', () => {
    const controller = new PlaceholdersController();
    const c = controller.list('c');
    expect(c.placeholders.map((entry) => entry.key)).toContain('timeframe');
    const cc = controller.list('cc');
    expect(cc.placeholders.map((entry) => entry.key)).toContain('timeframe');
    const bare = controller.list('bare');
    expect(bare.placeholders.length).toBeGreaterThanOrEqual(22);
    expect(bare.placeholders.map((entry) => entry.key)).not.toContain(
      'timeframe',
    );
  });

  it('GET unknown command → 404', async () => {
    const controller = new PlaceholdersController();
    await expect(
      (async () => controller.list('start'))(),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await statusOf(async () => controller.list('start'))).toBe(404);
  });

  it('every key of every command has an explicit PLACEHOLDER_META row (C9)', () => {
    // The controller falls back to `{type:'string', nullable:true,
    // example:''}` when a key is missing from PLACEHOLDER_META — a
    // silent gap. Every real row carries a non-empty example, so a
    // fallback is detectable at the response boundary. This iterates
    // ALL commands, so a key added to the registry without metadata
    // fails here instead of shipping an empty catalog entry.
    const controller = new PlaceholdersController();
    for (const command of TEMPLATE_COMMANDS) {
      for (const entry of controller.list(command).placeholders) {
        expect(entry.example).not.toBe('');
        expect(entry.type).not.toBe('');
      }
    }
  });

  it('exposes holderTopRow META (derived, nullable, blank-line example)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'holderTopRow');
    expect(entry).toBeDefined();
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    expect(entry?.example).toBe('\\n\\n👥 TH: 4.3⋅3.3⋅2.8⋅2.3⋅1.8 [20%]');
    expect(entry?.example.startsWith('\\n\\n')).toBe(true);
    expect(entry?.description).toEqual(expect.any(String));
  });

  it('returns placeholders alphabetically by key for ca + c (timeframe only c/cc)', () => {
    const controller = new PlaceholdersController();
    for (const command of ['ca', 'x'] as const) {
      const keys = controller.list(command).placeholders.map((e) => e.key);
      expect(keys).toEqual(
        [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      );
      expect(keys).not.toContain('timeframe');
    }
    const cKeys = controller.list('c').placeholders.map((e) => e.key);
    expect(cKeys).toEqual(
      [...cKeys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(cKeys).toContain('timeframe');
  });
});
