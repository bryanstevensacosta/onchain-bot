import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PreviewPlaygroundUseCase,
  type PreviewPlaygroundInput,
} from './preview-playground.use-case';

const templateRow = {
  id: 'id-1',
  name: 'default-feed',
  version: 1,
  content: 'Title: {{title}} | Body: {{original}} | img={{hasImage}}',
  systemContent: 'You are a rewriter.',
  variables: ['title', 'original', 'hasImage'],
  contentType: 'global' as const,
  isActive: true,
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
};

const makeCatalog = (source: 'ai-ml' | 'legacy-fallback' = 'ai-ml') => ({
  resolve: jest.fn().mockResolvedValue({ template: templateRow, source }),
});

const makeGenerator = (content = '[LLM MOCK] rewrite') => ({
  execute: jest.fn().mockResolvedValue({
    text: content,
    provider: 'mock',
    model: 'gpt-4o-mini',
    latencyMs: 1,
  }),
});

const makeConfig = () =>
  ({
    get: (key: string, def?: string): string => def ?? '',
  }) as never;

const makeUseCase = (catalog: unknown, generator: unknown) =>
  new PreviewPlaygroundUseCase(
    catalog as never,
    generator as never,
    makeConfig(),
  );

const baseInput: PreviewPlaygroundInput = {
  name: 'default-feed',
  rawTitle: 'Hi',
  rawContent: 'hello world',
  hasImage: false,
  generate: false,
};

describe('PreviewPlaygroundUseCase (ai-ml todo 2, failing-first)', () => {
  it('renders a template preview with zero LLM calls and zero persistence', async () => {
    const catalog = makeCatalog();
    const generator = makeGenerator();
    const useCase = makeUseCase(catalog, generator);
    const result = await useCase.execute(baseInput);
    expect(result.renderedUserPrompt).toBe(
      'Title: Hi | Body: hello world | img=no',
    );
    expect(result.systemPrompt).toBe('You are a rewriter.');
    expect(result.content).toBeNull();
    expect(result.source).toBe('ai-ml');
    expect(result.persisted).toBe(false);
    expect(generator.execute).not.toHaveBeenCalled();
    expect(catalog.resolve).toHaveBeenCalledWith('default-feed', {
      version: undefined,
    });
  });

  it('renders a draft preview without touching the catalog', async () => {
    const catalog = makeCatalog();
    const generator = makeGenerator();
    const useCase = makeUseCase(catalog, generator);
    const result = await useCase.execute({
      draft: { promptText: 'Say {{original}}!' },
      rawContent: 'hi',
      generate: false,
    });
    expect(result.renderedUserPrompt).toBe('Say hi!');
    expect(catalog.resolve).not.toHaveBeenCalled();
    expect(generator.execute).not.toHaveBeenCalled();
    expect(result.persisted).toBe(false);
  });

  it('runs exactly ONE generation on dry-run (generate=true), still without persistence', async () => {
    const catalog = makeCatalog();
    const generator = makeGenerator('[LLM MOCK] rewrite out');
    const useCase = makeUseCase(catalog, generator);
    const result = await useCase.execute({ ...baseInput, generate: true });
    expect(generator.execute).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('[LLM MOCK] rewrite out');
    expect(result.renderedUserPrompt).toBe(
      'Title: Hi | Body: hello world | img=no',
    );
    expect(result.persisted).toBe(false);
  });

  it('requires exactly one of name or draft', async () => {
    const useCase = makeUseCase(makeCatalog(), makeGenerator());
    await expect(useCase.execute({ rawContent: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      useCase.execute({
        name: 'a',
        draft: { promptText: 'b' },
        rawContent: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty rawContent', async () => {
    const useCase = makeUseCase(makeCatalog(), makeGenerator());
    await expect(
      useCase.execute({ name: 'default-feed', rawContent: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces unknown templates as 404 (no silent fallback on pinned versions)', async () => {
    const catalog = {
      resolve: jest.fn().mockRejectedValue(new NotFoundException('nope')),
    };
    const useCase = makeUseCase(catalog, makeGenerator());
    await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('surfaces provider outages explicitly (adversarial: LLM down)', async () => {
    const catalog = makeCatalog();
    const generator = {
      execute: jest
        .fn()
        .mockRejectedValue(
          new Error('No LLM provider available (provider=gateway)'),
        ),
    };
    const useCase = makeUseCase(catalog, generator);
    await expect(
      useCase.execute({ ...baseInput, generate: true }),
    ).rejects.toThrow('No LLM provider available');
  });
});
