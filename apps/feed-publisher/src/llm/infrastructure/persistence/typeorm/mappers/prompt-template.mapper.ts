import { PromptTemplate } from '../../../../domain/prompt-template.entity';
import type { TemplateContentType } from '../../../../domain/prompt-template.entity';
import { PromptTemplateOrmEntity } from '../prompt-template.orm-entity';

/** Domain <-> TypeORM mapper for `PromptTemplate` (unwired until GAP-1). */
export const toPromptTemplateRow = (template: PromptTemplate): PromptTemplateOrmEntity => {
  const row = new PromptTemplateOrmEntity();
  row.id = template.id;
  row.name = template.name;
  row.description = template.description;
  row.contentType = template.contentType;
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
};

export const toPromptTemplateDomain = (row: PromptTemplateOrmEntity): PromptTemplate =>
  PromptTemplate.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    contentType: row.contentType as TemplateContentType,
    model: row.model,
    supportsVision: row.supportsVision,
    maxTokens: row.maxTokens,
    temperature: Number(row.temperature),
    reasoningEffort: row.reasoningEffort as PromptTemplate['reasoningEffort'],
    promptText: row.promptText,
    systemPromptText: row.systemPromptText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
