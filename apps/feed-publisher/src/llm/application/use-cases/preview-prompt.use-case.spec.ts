import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PreviewPromptUseCase } from './preview-prompt.use-case';
import { FeedLlmGenerator } from '../../infrastructure/llm/feed-llm-generator.adapter';
import { LlmPort } from '../ports/llm.port';
import { PromptTemplate } from '../../domain/prompt-template.entity';
import type { PromptTemplateRepository } from '../../domain/ports/prompt-template.repository';

const template = (): PromptTemplate =>
  PromptTemplate.create({
    id: 'default-feed',
    name: 'default-feed',
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.7,
    promptText: 'Title: {{title}}\nBody: {{original}}',
  });

const templateRepo = (): PromptTemplateRepository =>
  ({
    findById: async (id: string): Promise<PromptTemplate | null> =>
      id === 'default-feed' ? template() : null,
    findAll: async (): Promise<ReadonlyArray<PromptTemplate>> => [template()],
    save: async (t: PromptTemplate): Promise<PromptTemplate> => t,
    delete: async (): Promise<boolean> => true,
  }) as PromptTemplateRepository;

class RecordingPort extends LlmPort {
  public calls = 0;
  public async generateText(): Promise<string> {
    this.calls += 1;
    return 'DRAFT-GENERATED';
  }
  public async isAvailable(): Promise<boolean> {
    return true;
  }
}

const generator = (): FeedLlmGenerator =>
  ({
    renderPromptFor: (body: string) => `FAKE:${body}`,
  }) as unknown as FeedLlmGenerator;

const useCase = (port: RecordingPort): { useCase: PreviewPromptUseCase; port: RecordingPort } => {
  const config = { get: (): string => '' } as unknown as ConfigService;
  return {
    useCase: new PreviewPromptUseCase(generator(), templateRepo(), port, config),
    port,
  };
};

describe('PreviewPromptUseCase (side-effect free)', () => {
  it('renders a stored template without calling the provider', async () => {
    const port = new RecordingPort();
    const { useCase: uc } = useCase(port);
    const result = await uc.execute({
      templateId: 'default-feed',
      rawContent: 'Bitcoin sube',
      rawTitle: 'Mercado',
    });
    expect(result.content).toBeNull();
    expect(result.renderedUserPrompt).toBe('FAKE:Title: {{title}}\nBody: {{original}}');
    expect(port.calls).toBe(0);
  });

  it('renders an inline draft without calling the provider', async () => {
    const port = new RecordingPort();
    const { useCase: uc } = useCase(port);
    const result = await uc.execute({
      draft: { promptText: 'Draft: {{original}}' },
      rawContent: 'Hola',
    });
    expect(result.content).toBeNull();
    expect(result.model).toBe('gpt-4o-mini');
    expect(port.calls).toBe(0);
  });

  it('generates one draft call on demand and persists nothing', async () => {
    const port = new RecordingPort();
    const { useCase: uc } = useCase(port);
    const result = await uc.execute({
      draft: { promptText: 'Draft: {{original}}' },
      rawContent: 'Hola',
      generate: true,
    });
    expect(result.content).toBe('DRAFT-GENERATED');
    expect(port.calls).toBe(1);
  });

  it('rejects templateId+draft both set, neither set, empty body, unknown template', async () => {
    const port = new RecordingPort();
    const { useCase: uc } = useCase(port);
    await expect(
      uc.execute({
        templateId: 'default-feed',
        draft: { promptText: 'x' },
        rawContent: 'Hola',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(uc.execute({ rawContent: 'Hola' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      uc.execute({ draft: { promptText: 'x' }, rawContent: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      uc.execute({ templateId: 'missing', rawContent: 'Hola' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
