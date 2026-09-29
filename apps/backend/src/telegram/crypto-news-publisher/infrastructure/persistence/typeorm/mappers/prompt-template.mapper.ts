/**
 * @deprecated Moved to apps/feed-publisher/src/queue/ + apps/feed-publisher/src/llm/ + apps/feed-publisher/src/keywords/ (Tramo 2, todos 3+4+5 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add queue/llm/keywords logic in apps/feed-publisher/src/{queue,llm,keywords}/ instead.
 */
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { PromptTemplateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity';

/**
 * Maps between the domain aggregate `PromptTemplate` and its anemic
 * TypeORM persistence shape `PromptTemplateEntity`.
 */
export class PromptTemplateMapper {
  public static toEntity(template: PromptTemplate): PromptTemplateEntity {
    const row = new PromptTemplateEntity();
    row.id = template.id;
    row.name = template.name;
    row.description = template.description;
    row.model = template.model;
    row.supportsVision = template.supportsVision;
    row.maxTokens = template.maxTokens;
    row.temperature = template.temperature;
    row.reasoningEffort = template.reasoningEffort;
    row.promptText = template.promptText;
    row.systemPromptText = template.systemPromptText;
    row.createdAt = template.createdAt;
    row.updatedAt = template.updatedAt;
    return row;
  }

  public static toDomain(row: PromptTemplateEntity): PromptTemplate {
    return PromptTemplate.reconstitute({
      id: row.id,
      name: row.name,
      description: row.description,
      model: row.model,
      supportsVision: row.supportsVision ?? true,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
      reasoningEffort: row.reasoningEffort,
      promptText: row.promptText,
      systemPromptText: row.systemPromptText ?? '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
