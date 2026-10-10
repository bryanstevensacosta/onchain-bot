import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { KNOWN_LAUNCHPAD_IDS } from '@/templates/domain/launchpad-override.validators';
import { InMemoryLaunchpadOverrideRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-launchpad-override.repository';
import { LaunchpadOverridesController } from './launchpad-overrides.controller';

const SOL_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const EVM_MIXED = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC';

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

const responseOf = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return (error as { getResponse: () => unknown }).getResponse();
  }
  throw new Error('expected the call to throw');
};

describe('LaunchpadOverridesController (plan todo 37)', () => {
  const setup = (): LaunchpadOverridesController => {
    const repo = new InMemoryLaunchpadOverrideRepository();
    return new LaunchpadOverridesController(repo);
  };

  it('POST creates + GET lists it + GET /:id returns the row', async () => {
    const controller = setup();
    const created = await controller.create({
      mint: SOL_MINT,
      launchpadId: 'pump-fun',
      note: 'curated',
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.mint).toBe(SOL_MINT);
    expect(created.launchpadId).toBe('pump-fun');
    expect(created.note).toBe('curated');
    expect(await controller.list()).toHaveLength(1);
    await expect(controller.getOne(created.id)).resolves.toEqual(created);
  });

  it('POST normalizes EVM mint to lowercase (case-variant re-POST → 409)', async () => {
    const controller = setup();
    const created = await controller.create({
      mint: EVM_MIXED,
      launchpadId: 'bankr',
    });
    expect(created.mint).toBe(EVM_MIXED.toLowerCase());
    expect(created.note).toBeNull();
    await expect(
      controller.create({
        mint: EVM_MIXED.toLowerCase(),
        launchpadId: 'clanker',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await statusOf(() =>
        controller.create({
          mint: EVM_MIXED,
          launchpadId: 'clanker',
        }),
      ),
    ).toBe(409);
  });

  it('POST unknown launchpad_id → 400 with the slug whitelist', async () => {
    const controller = setup();
    await expect(
      controller.create({ mint: SOL_MINT, launchpadId: 'gofundmeme' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await statusOf(() =>
        controller.create({ mint: SOL_MINT, launchpadId: 'gofundmeme' }),
      ),
    ).toBe(400);
    const body = (await responseOf(() =>
      controller.create({ mint: SOL_MINT, launchpadId: 'gofundmeme' }),
    )) as { error: string; valid: string[] };
    expect(body.valid).toEqual([...KNOWN_LAUNCHPAD_IDS]);
    expect(body.valid).toContain('pump-fun');
  });

  it('POST malformed mint → 400', async () => {
    const controller = setup();
    for (const mint of ['not-a-mint', '', '0x1234']) {
      await expect(
        controller.create({ mint, launchpadId: 'pump-fun' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        await statusOf(() =>
          controller.create({ mint, launchpadId: 'pump-fun' }),
        ),
      ).toBe(400);
    }
    expect(await controller.list()).toHaveLength(0);
  });

  it('GET ?mint= filters to the normalized row (unknown mint → [])', async () => {
    const controller = setup();
    await controller.create({ mint: SOL_MINT, launchpadId: 'pump-fun' });
    await controller.create({ mint: EVM_MIXED, launchpadId: 'bankr' });
    expect(await controller.list()).toHaveLength(2);
    const filtered = await controller.list(SOL_MINT);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].launchpadId).toBe('pump-fun');
    // EVM lookup is case-insensitive by normalization (0x prefix stays
    // lowercase — only the hex body varies in checksummed input).
    const checksummed = `0x${EVM_MIXED.slice(2).toUpperCase()}`;
    expect(await controller.list(checksummed)).toHaveLength(1);
    expect(
      await controller.list('JUPyiwrYJFskUPiHa7hVuNQPiyaPZ3ar1ZkL6vwdB'),
    ).toHaveLength(0);
  });

  it('GET ?mint=malformed → 400; GET /:id unknown → 404; DELETE unknown → 404', async () => {
    const controller = setup();
    expect(await statusOf(() => controller.list('garbage!!'))).toBe(400);
    await expect(controller.getOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.remove('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('DELETE removes the row (later GET /:id → 404)', async () => {
    const controller = setup();
    const created = await controller.create({
      mint: SOL_MINT,
      launchpadId: 'pump-fun',
    });
    await controller.remove(created.id);
    expect(await controller.list()).toHaveLength(0);
    await expect(controller.getOne(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
