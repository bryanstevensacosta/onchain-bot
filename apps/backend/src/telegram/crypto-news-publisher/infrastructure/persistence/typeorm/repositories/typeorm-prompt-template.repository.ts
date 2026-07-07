import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { PromptTemplateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity';
import { PromptTemplateMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/prompt-template.mapper';

/**
 * Postgres-backed implementation of `PromptTemplateRepository`.
 *
 * `save()` is an upsert (PK is an entity-supplied UUID; new rows
 * insert, existing rows update). The DB enforces `@Unique(name)` —
 * a duplicate-name save throws and surfaces to the caller.
 *
 * `delete()` is a hard delete by primary key. The 409 "in use" guard
 * lives in the controller (T2) because computing "in use" requires
 * reading `LlmConfig.defaultTemplateId` and `Keyword.templateId`,
 * which is more naturally a use-case concern than a persistence
 * concern.
 */
@Injectable()
export class TypeOrmPromptTemplateRepository extends PromptTemplateRepository {
  constructor(
    @InjectRepository(PromptTemplateEntity)
    private readonly repo: Repository<PromptTemplateEntity>,
  ) {
    super();
  }

  public async findAll(): Promise<ReadonlyArray<PromptTemplate>> {
    const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => PromptTemplateMapper.toDomain(r));
  }

  public async findById(id: string): Promise<PromptTemplate | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? PromptTemplateMapper.toDomain(row) : null;
  }

  public async findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<PromptTemplate>> {
    if (ids.length === 0) return [];
    const rows = await this.repo.find({ where: { id: In([...ids]) } });
    return rows.map((r) => PromptTemplateMapper.toDomain(r));
  }

  public async save(template: PromptTemplate): Promise<PromptTemplate> {
    const row = PromptTemplateMapper.toEntity(template);
    const saved = await this.repo.save(row);
    return PromptTemplateMapper.toDomain(saved);
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
