import type { PublishingContentTemplate } from '../entities/publishing-template.entity';

/**
 * Content-template repository port (in-memory live, TypeORM deferred GAP-1).
 */
export abstract class ContentTemplateRepository {
  public abstract save(template: PublishingContentTemplate): Promise<void>;
  public abstract findById(
    id: string,
  ): Promise<PublishingContentTemplate | null>;
  public abstract list(): Promise<ReadonlyArray<PublishingContentTemplate>>;
  public abstract remove(id: string): Promise<boolean>;
}
