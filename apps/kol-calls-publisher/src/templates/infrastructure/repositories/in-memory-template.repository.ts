import { Injectable } from '@nestjs/common';
import { TemplateRepository } from '../../domain/ports/template.repository';
import type { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

/**
 * In-memory template store (upsert by id = double-delivery guard, P1).
 */
@Injectable()
export class InMemoryTemplateRepository extends TemplateRepository {
  private readonly rows = new Map<string, PublishingTemplate>();

  public async save(template: PublishingTemplate): Promise<void> {
    this.rows.set(template.id, template);
  }

  public async findById(id: string): Promise<PublishingTemplate | null> {
    return this.rows.get(id) ?? null;
  }

  public async findAll(): Promise<PublishingTemplate[]> {
    return [...this.rows.values()];
  }

  public async findActive(): Promise<PublishingTemplate[]> {
    return [...this.rows.values()].filter((template) => template.active);
  }

  public async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
