import type { PublishingTemplate } from '../entities/publishing-template.entity';

/**
 * Persistence port for templates (same kol-system DB; in-memory today —
 * TypeORM entity + migration land with the persistence todo).
 *
 * Upsert by id = double-delivery guard (P1, same pattern as the pipeline
 * repos). The `vip-calls` seed is a datum (P14), not a module.
 */
export abstract class TemplateRepository {
  public abstract save(template: PublishingTemplate): Promise<void>;
  public abstract findById(id: string): Promise<PublishingTemplate | null>;
  public abstract findAll(): Promise<PublishingTemplate[]>;
  public abstract findActive(): Promise<PublishingTemplate[]>;
  public abstract remove(id: string): Promise<boolean>;
  public abstract count(): Promise<number>;
}
