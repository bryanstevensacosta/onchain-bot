import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import { EmojiResolverService } from '@/templates/application/emoji-resolver.service';
import { EMOJI_PLACEHOLDER_KEYS } from '@/templates/domain/emoji-map.validators';
import { InMemoryEmojiMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-emoji-map.repository';
import { EmojiMapsController } from './emoji-maps.controller';

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

const responseOf = async (
  run: () => Promise<unknown>,
): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return (error as { getResponse: () => unknown }).getResponse();
  }
  throw new Error('expected the call to throw');
};

describe('EmojiMapsController (todo 8)', () => {
  const setup = (): {
    controller: EmojiMapsController;
    resolver: EmojiResolverService;
  } => {
    const repo = new InMemoryEmojiMapRepository();
    const resolver = new EmojiResolverService(repo);
    return { controller: new EmojiMapsController(repo, resolver), resolver };
  };

  it('POST creates (chain, solana, 🟣) and GET lists it', async () => {
    const { controller } = setup();
    const created = await controller.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.placeholderKey).toBe('chain');
    expect(created.matchValue).toBe('solana');
    expect(created.emoji).toBe('🟣');
    const all = await controller.list();
    expect(all).toHaveLength(1);
  });

  it('GET ?placeholderKey=chain filters by key', async () => {
    const { controller } = setup();
    await controller.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    await controller.create({
      placeholderKey: 'chain',
      matchValue: 'ethereum',
      emoji: '🔵',
    });
    const filtered = await controller.list('chain');
    expect(filtered).toHaveLength(2);
    const empty = await controller.list('symbol');
    expect(empty).toHaveLength(0);
  });

  it('GET ?placeholderKey=precio → 400 with the whitelist', async () => {
    const { controller } = setup();
    await expect(controller.list('precio')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await statusOf(() => controller.list('precio'))).toBe(400);
    const body = (await responseOf(() => controller.list('precio'))) as {
      error: string;
      valid: string[];
    };
    expect(body.valid).toEqual([...EMOJI_PLACEHOLDER_KEYS]);
    expect(body.valid).toContain('chain');
  });

  it('POST duplicate (chain, solana) → 409', async () => {
    const { controller } = setup();
    await controller.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    await expect(
      controller.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        emoji: '🟪',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await statusOf(() =>
        controller.create({
          placeholderKey: 'chain',
          matchValue: 'solana',
          emoji: '🟪',
        }),
      ),
    ).toBe(409);
  });

  it('POST case-variant duplicate (chain, Solana) → 409 (write-side normalization)', async () => {
    const { controller } = setup();
    await controller.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    await expect(
      controller.create({
        placeholderKey: 'chain',
        matchValue: 'Solana',
        emoji: '🟪',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("POST placeholderKey 'precio' → 400 with the whitelist", async () => {
    const { controller } = setup();
    await expect(
      controller.create({
        placeholderKey: 'precio',
        matchValue: 'x',
        emoji: '🟣',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const body = (await responseOf(() =>
      controller.create({
        placeholderKey: 'precio',
        matchValue: 'x',
        emoji: '🟣',
      }),
    )) as { error: string; valid: string[] };
    expect(body.valid).toContain('chain');
  });

  it("POST empty emoji → 400 (and oversize matchValue → 400)", async () => {
    const { controller } = setup();
    await expect(
      controller.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        emoji: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.create({
        placeholderKey: 'chain',
        matchValue: 'x'.repeat(41),
        emoji: '🟣',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PATCH updates emoji + refreshes the resolver cache', async () => {
    const { controller, resolver } = setup();
    const created = await controller.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    const refresh = jest.spyOn(resolver, 'refresh');
    const updated = await controller.update(created.id, { emoji: '💜' });
    expect(updated.emoji).toBe('💜');
    expect(refresh).toHaveBeenCalled();
    expect(resolver.resolve('chain', 'solana')).toBe('💜');
  });

  it('PATCH unknown id → 404; DELETE unknown id → 404', async () => {
    const { controller } = setup();
    await expect(
      controller.update('missing-id', { emoji: '💜' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await statusOf(() => controller.update('missing-id', { emoji: '💜' })),
    ).toBe(404);
    await expect(controller.remove('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('DELETE removes the row (later PATCH → 404)', async () => {
    const { controller } = setup();
    const created = await controller.create({
      placeholderKey: 'chain',
      matchValue: 'ton',
      emoji: '💎',
    });
    await controller.remove(created.id);
    expect(await controller.list()).toHaveLength(0);
    await expect(
      controller.update(created.id, { emoji: '🟣' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolve-e2e: created (chain, solana, 🟣) renders via TemplateRenderer', async () => {
    const { controller, resolver } = setup();
    await controller.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      emoji: '🟣',
    });
    const renderer = new TemplateRendererService(resolver);
    const out = renderer.render('{{chainEmoji}}', { chain: 'solana' }, 'ca');
    expect(out.text).toContain('🟣');
    // case-insensitive read path: 'Solana' resolves the same row
    const upper = renderer.render(
      '{{chainEmoji}}',
      { chain: 'Solana' },
      'ca',
    );
    expect(upper.text).toContain('🟣');
  });
});
