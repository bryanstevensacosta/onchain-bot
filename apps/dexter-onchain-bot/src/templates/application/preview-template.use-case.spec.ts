import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import type { ResolveOutcome } from '@/scan/application/pipeline/token-scan.pipeline';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import { DisplayResolverService } from '@/templates/application/display-resolver.service';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { InMemoryDisplayMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-display-map.repository';
import { InMemoryMessageTemplateRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';
import {
  PreviewTemplateUseCase,
  type PreviewScanPipeline,
  type PreviewTemplateResult,
} from './preview-template.use-case';

const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

const TOKEN: ResolvedToken = {
  address: SOL_ADDRESS,
  chain: 'solana',
  symbol: 'SOL',
  name: 'Solana',
  marketCapUsd: 80_000_000_000,
  fdvUsd: 95_000_000_000,
  priceUsd: 164.32,
  priceChange24h: 2.5,
  liquidityUsd: 12_000_000,
  lockedLiquidityPercent: 80,
  burnedPercent: 5,
  volume24hUsd: 2_500_000_000,
  holders: 1_200_000,
  top10HolderPercent: 12.5,
  top20HolderPercent: 18.75,
  totalSupply: 600_000_000,
  circulatingSupply: 480_000_000,
  maxSupply: null,
  devWallets: [
    {
      wallet: 'DevWallet1111111111111111111111111111111111',
      holdAmount: null,
      percentOfSupply: 1.25,
      pnlUsd: null,
      tag: null,
    },
  ],
  devPctSupply: 1.25,
  poolAddress: 'Pool111111111111111111111111111111111111111',
  source: 'market-data-http',
};

const BODY = [
  '{{chainDisplay}} ${{symbol}} | {{name}} — {{chain}}',
  '`{{address}}`',
  '',
  '💰 {{priceUsd}} ({{priceChange24h}}) • MC {{marketCapUsd}} • Liq {{liquidityUsd}}',
  '👥 Holders {{holders}} • {{devLine}}',
  '',
  '🔗 {{scanLinks}}',
  '{{tradeHint}}',
].join('\n');

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

const resolvedPipeline = (): PreviewScanPipeline & {
  resolveDetailed: jest.Mock;
} => ({
  resolveDetailed: jest.fn(
    async (address: string): Promise<ResolveOutcome> => ({
      status: 'resolved',
      token: { ...TOKEN, address },
    }),
  ),
});

const setup = async (
  pipeline?: PreviewScanPipeline,
): Promise<{
  useCase: PreviewTemplateUseCase;
  templates: InMemoryMessageTemplateRepository;
  pipeline: PreviewScanPipeline;
}> => {
  const templates = new InMemoryMessageTemplateRepository();
  const mapRepo = new InMemoryDisplayMapRepository();
  await mapRepo.save(
    DisplayMap.create({
      placeholderKey: 'chain',
      matchValue: 'solana',
      display: '🟣',
    }),
  );
  const displays = new DisplayResolverService(mapRepo);
  await displays.refresh();
  const renderer = new TemplateRendererService(displays);
  const pipe = pipeline ?? resolvedPipeline();
  return {
    useCase: new PreviewTemplateUseCase(pipe, templates, renderer, displays),
    templates,
    pipeline: pipe,
  };
};

const isResult = (
  output: unknown,
): output is PreviewTemplateResult =>
  typeof output === 'object' &&
  output !== null &&
  'parseMode' in output;

describe('PreviewTemplateUseCase (todo 7 dry-run preview)', () => {
  it('previews by templateId with the Solana fixture (MarkdownV2, $SYM)', async () => {
    const { useCase, templates } = await setup();
    const saved = await templates.save(
      MessageTemplate.create({
        command: 'ca',
        name: 'full-dexter-v1',
        bodyMarkdown: BODY,
      }),
    );
    const output = await useCase.execute({
      templateId: saved.id,
      address: SOL_ADDRESS,
    });
    expect(isResult(output)).toBe(true);
    if (!isResult(output)) {
      throw new Error('expected a rendered result');
    }
    expect(output.parseMode).toBe('MarkdownV2');
    expect(output.text).toContain('🟣');
    expect(output.text).toContain('$SOL');
    expect(output.text).toContain(SOL_ADDRESS);
    expect(output.truncated).toBe(false);
    expect(output.unknown).toEqual([]);
    expect(output.placeholdersUsed).toEqual(
      expect.arrayContaining(['symbol', 'chainDisplay', 'devLine']),
    );
  });

  it('previews by draft without persisting anything', async () => {
    const { useCase, templates } = await setup();
    const output = await useCase.execute({
      draft: { command: 'ca', bodyMarkdown: BODY },
      address: SOL_ADDRESS,
    });
    expect(isResult(output)).toBe(true);
    if (!isResult(output)) {
      throw new Error('expected a rendered result');
    }
    expect(output.text).toContain('$SOL');
    expect(await templates.findAll()).toHaveLength(0);
  });

  it('preview never flips isActive and never mutates the stored template', async () => {
    const { useCase, templates } = await setup();
    const saved = await templates.save(
      MessageTemplate.create({
        command: 'ca',
        name: 'full-dexter-v1',
        bodyMarkdown: BODY,
      }),
    );
    const before = await templates.findById(saved.id);
    await useCase.execute({ templateId: saved.id, address: SOL_ADDRESS });
    const after = await templates.findById(saved.id);
    expect(after?.isActive).toBe(false);
    expect(after?.version).toBe(before?.version);
    expect(after?.bodyMarkdown).toBe(BODY);
    expect(await templates.findAll()).toHaveLength(1);
  });

  it('templateId + draft together → 400 XOR; neither → 400', async () => {
    const { useCase, templates } = await setup();
    const saved = await templates.save(
      MessageTemplate.create({
        command: 'ca',
        name: 'full-dexter-v1',
        bodyMarkdown: BODY,
      }),
    );
    expect(
      await statusOf(() =>
        useCase.execute({
          templateId: saved.id,
          draft: { command: 'ca', bodyMarkdown: BODY },
          address: SOL_ADDRESS,
        }),
      ),
    ).toBe(400);
    expect(
      await statusOf(() => useCase.execute({ address: SOL_ADDRESS })),
    ).toBe(400);
  });

  it('unknown templateId → 404', async () => {
    const { useCase } = await setup();
    expect(
      await statusOf(() =>
        useCase.execute({ templateId: 'missing-id', address: SOL_ADDRESS }),
      ),
    ).toBe(404);
  });

  it('draft with {{xxx}} → 400 + valid list', async () => {
    const { useCase } = await setup();
    expect(
      await statusOf(() =>
        useCase.execute({
          draft: { command: 'ca', bodyMarkdown: 'Precio: {{xxx}}' },
          address: SOL_ADDRESS,
        }),
      ),
    ).toBe(400);
    const body = (await responseOf(() =>
      useCase.execute({
        draft: { command: 'ca', bodyMarkdown: 'Precio: {{xxx}}' },
        address: SOL_ADDRESS,
      }),
    )) as { error: string; valid: string[] };
    expect(body.error).toContain('{{xxx}}');
    expect(body.valid).toContain('symbol');
    expect(body.valid).toContain('chainDisplay');
    expect(body.valid).not.toContain('xxx');
  });

  it("timeframe '9m' on c → 400; '1h' renders; timeframe on ca → 400", async () => {
    const { useCase } = await setup();
    const chartBody = '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}';
    expect(
      await statusOf(() =>
        useCase.execute({
          draft: { command: 'c', bodyMarkdown: chartBody },
          address: SOL_ADDRESS,
          timeframe: '9m',
        }),
      ),
    ).toBe(400);
    const bad = (await responseOf(() =>
      useCase.execute({
        draft: { command: 'c', bodyMarkdown: chartBody },
        address: SOL_ADDRESS,
        timeframe: '9m',
      }),
    )) as { error: string; valid: string[] };
    expect(bad.valid).toContain('1h');
    const ok = await useCase.execute({
      draft: { command: 'c', bodyMarkdown: chartBody },
      address: SOL_ADDRESS,
      timeframe: '1h',
    });
    expect(isResult(ok)).toBe(true);
    if (isResult(ok)) {
      expect(ok.text).toContain('1h');
      expect(ok.placeholdersUsed).toContain('timeframe');
    }
    expect(
      await statusOf(() =>
        useCase.execute({
          draft: { command: 'ca', bodyMarkdown: BODY },
          address: SOL_ADDRESS,
          timeframe: '1h',
        }),
      ),
    ).toBe(400);
  });

  it('garbage address propagates the invalid shape (no throw)', async () => {
    const { useCase } = await setup({
      resolveDetailed: jest.fn(
        async (address: string): Promise<ResolveOutcome> => ({
          status: 'invalid',
          address,
          reason: 'unrecognized address format (expected 0x + 40 hex for EVM or base58 32-44 chars for Solana)',
        }),
      ),
    });
    const output = await useCase.execute({
      draft: { command: 'ca', bodyMarkdown: BODY },
      address: 'not-an-address',
    });
    expect(output).toEqual({
      error: expect.stringContaining('Invalid address'),
      address: 'not-an-address',
    });
  });

  it('multi-chain address propagates the ambiguous shape with candidates', async () => {
    const { useCase } = await setup({
      resolveDetailed: jest.fn(
        async (address: string): Promise<ResolveOutcome> => ({
          status: 'ambiguous',
          address,
          candidates: ['ethereum', 'base'],
        }),
      ),
    });
    const output = await useCase.execute({
      draft: { command: 'ca', bodyMarkdown: BODY },
      address: '0x1234567890123456789012345678901234567890',
    });
    expect(output).toEqual({
      error: expect.stringContaining('Ambiguous'),
      address: '0x1234567890123456789012345678901234567890',
      candidates: ['ethereum', 'base'],
    });
  });

  it('failing lookup propagates the not-found shape', async () => {
    const { useCase } = await setup({
      resolveDetailed: jest.fn(
        async (address: string): Promise<ResolveOutcome> => ({
          status: 'not-found',
          address,
        }),
      ),
    });
    const output = await useCase.execute({
      draft: { command: 'ca', bodyMarkdown: BODY },
      address: SOL_ADDRESS,
    });
    expect(output).toEqual({ error: 'Token not found', address: SOL_ADDRESS });
  });

  it('preview files never reference the bot sender (zero-send construction guard)', () => {
    for (const relative of [
      'preview-template.use-case.ts',
      '../api/http/template-preview.controller.ts',
      '../../placeholders/api/http/placeholders.controller.ts',
    ]) {
      const source = readFileSync(
        join(__dirname, relative),
        'utf8',
      );
      expect(source).not.toMatch(/TelegramBotClient/);
      expect(source).not.toMatch(/sendMessage/);
    }
  });
});
