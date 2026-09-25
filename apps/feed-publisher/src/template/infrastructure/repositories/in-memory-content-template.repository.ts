import { Injectable } from '@nestjs/common';
import type { PublishingContentTemplate } from '../../domain/entities/publishing-template.entity';
import { ContentTemplateRepository } from '../../domain/ports/content-template.repository';

/**
 * In-memory content-template repository (live; TypeORM deferred GAP-1).
 */
@Injectable()
export class InMemoryContentTemplateRepository extends ContentTemplateRepository {
  private readonly rows = new Map<string, PublishingContentTemplate>();

  public async save(template: PublishingContentTemplate): Promise<void> {
    this.rows.set(template.id, template);
  }

  public async findById(id: string): Promise<PublishingContentTemplate | null> {
    return this.rows.get(id) ?? null;
  }

  public async list(): Promise<ReadonlyArray<PublishingContentTemplate>> {
    return [...this.rows.values()];
  }

  public async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
