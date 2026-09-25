import { Injectable } from '@nestjs/common';
import { PromptTemplate } from '../../../domain/prompt-template.entity';
import { PromptTemplateRepository } from '../../../domain/ports/prompt-template.repository';

/**
 * In-memory GLOBAL template catalog (live binding until GAP-1). Seeds
 * the `default-feed` template referenced by the seeded `LlmConfig`, so
 * mock-mode generation and playground render work on a fresh boot.
 */
@Injectable()
export class InMemoryPromptTemplateRepository extends PromptTemplateRepository {
  private readonly store = new Map<string, PromptTemplate>();

  public constructor() {
    super();
    const seeded = PromptTemplate.create({
      id: 'default-feed',
      name: 'default-feed',
      description: 'Default feed rewrite (GLOBAL catalog seed)',
      contentType: 'global',
      model: 'gpt-4o-mini',
      maxTokens: 800,
      temperature: 0.7,
      promptText:
        'Rewrite the following crypto news for a Telegram channel, in Spanish, keeping facts intact:\n\n{{original}}',
      systemPromptText: 'You are a concise crypto-news editor.',
    });
    this.store.set(seeded.id, seeded);
  }

  public async findAll(): Promise<ReadonlyArray<PromptTemplate>> {
    return [...this.store.values()];
  }

  public async findById(id: string): Promise<PromptTemplate | null> {
    return this.store.get(id) ?? null;
  }

  public async save(template: PromptTemplate): Promise<PromptTemplate> {
    this.store.set(template.id, template);
    return template;
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
