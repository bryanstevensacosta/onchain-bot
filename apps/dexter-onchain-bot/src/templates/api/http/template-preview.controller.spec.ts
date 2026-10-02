import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import type { ResolveOutcome } from '@/scan/application/pipeline/token-scan.pipeline';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import { DisplayResolverService } from '@/templates/application/display-resolver.service';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { InMemoryDisplayMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-display-map.repository';
import { InMemoryMessageTemplateRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';
import {
  PreviewTemplateUseCase,
  type PreviewScanPipeline,
} from '@/templates/application/preview-template.use-case';
import { TemplatePreviewController } from './template-preview.controller';

const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

const BODY = [
  '{{chainDisplay}} ${{symbol}} | {{name}} — {{chain}}',
  '`{{address}}`',
  '💰 {{priceUsd}} • MC {{marketCapUsd}}',
  '🔗 {{scanLinks}}',
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

const setup = async (): Promise<{
  controller: TemplatePreviewController;
  templates: InMemoryMessageTemplateRepository;
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
  const pipeline: PreviewScanPipeline = {
    resolveDetailed: async (address: string): Promise<ResolveOutcome> => ({
      status: 'resolved',
      token: {
        address,
        chain: 'solana',
        symbol: 'SOL',
        name: 'Solana',
        marketCapUsd: 80_000_000_000,
        fdvUsd: null,
        priceUsd: 164.32,
        priceChange24h: null,
        liquidityUsd: null,
        lockedLiquidityPercent: null,
        burnedPercent: null,
        volume24hUsd: null,
        holders: null,
        top10HolderPercent: null,
        top20HolderPercent: null,
        totalSupply: null,
        circulatingSupply: null,
        maxSupply: null,
        devWallets: null,
        devPctSupply: null,
        poolAddress: null,
        source: 'market-data-http',
      },
    }),
  };
  const useCase = new PreviewTemplateUseCase(
    pipeline,
    templates,
    new TemplateRendererService(displays),
    displays,
  );
  return { controller: new TemplatePreviewController(useCase), templates };
};

describe('TemplatePreviewController (todo 7 preview route)', () => {
  it('POST by draft renders MarkdownV2 text with $SYM', async () => {
    const { controller } = await setup();
    const output = await controller.previewTemplate({
      draft: { command: 'ca', bodyMarkdown: BODY },
      address: SOL_ADDRESS,
    });
    expect(output).toMatchObject({ parseMode: 'MarkdownV2', unknown: [] });
    if ('text' in output) {
      expect(output.text).toContain('$SOL');
      expect(output.text).toContain('🟣');
    } else {
      throw new Error('expected a rendered result');
    }
  });

  it('POST by templateId renders the stored body', async () => {
    const { controller, templates } = await setup();
    const saved = await templates.save(
      MessageTemplate.create({
        command: 'ca',
        name: 'full-dexter-v1',
        bodyMarkdown: BODY,
      }),
    );
    const output = await controller.previewTemplate({
      templateId: saved.id,
      address: SOL_ADDRESS,
    });
    if ('text' in output) {
      expect(output.text).toContain('$SOL');
    } else {
      throw new Error('expected a rendered result');
    }
  });

  it('POST templateId + draft → 400 XOR', async () => {
    const { controller, templates } = await setup();
    const saved = await templates.save(
      MessageTemplate.create({
        command: 'ca',
        name: 'full-dexter-v1',
        bodyMarkdown: BODY,
      }),
    );
    expect(
      await statusOf(() =>
        controller.previewTemplate({
          templateId: saved.id,
          draft: { command: 'ca', bodyMarkdown: BODY },
          address: SOL_ADDRESS,
        }),
      ),
    ).toBe(400);
  });

  it("POST draft with timeframe '9m' on c → 400", async () => {
    const { controller } = await setup();
    expect(
      await statusOf(() =>
        controller.previewTemplate({
          draft: {
            command: 'c',
            bodyMarkdown: '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}',
          },
          address: SOL_ADDRESS,
          timeframe: '9m',
        }),
      ),
    ).toBe(400);
  });

  it('POST draft with {{xxx}} → 400', async () => {
    const { controller } = await setup();
    expect(
      await statusOf(() =>
        controller.previewTemplate({
          draft: { command: 'ca', bodyMarkdown: 'Oops {{xxx}}' },
          address: SOL_ADDRESS,
        }),
      ),
    ).toBe(400);
  });
});
