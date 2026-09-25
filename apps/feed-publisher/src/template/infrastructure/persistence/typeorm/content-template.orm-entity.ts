import { Injectable } from '@nestjs/common';
import type { ContentTemplateView } from '../../../application/use-cases/content-template.use-cases';

/**
 * UNWIRED TypeORM shape for content templates (GAP-1).
 *
 * Documents the future `feed_content_templates` table without wiring it:
 * no `forFeature` registers this class, so it never touches a
 * connection. The in-memory repository is the live binding.
 */
@Injectable()
export class ContentTemplateOrmEntity {
  public id!: string;
  public name!: string;
  public active!: boolean;
  public sourceIds!: string[];
  public keywordIds!: string[];
  public promptTemplateId!: string | null;
  public targets!: string[];
  public view!: ContentTemplateView | null;
}
