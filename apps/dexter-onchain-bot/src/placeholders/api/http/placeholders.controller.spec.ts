import { NotFoundException } from '@nestjs/common';
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
});
