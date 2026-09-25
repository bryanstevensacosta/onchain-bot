import { Injectable } from '@nestjs/common';
import { ContentTemplateRepository } from '../domain/ports/content-template.repository';

/**
 * P21 hook point: content-templates health indicator.
 */
@Injectable()
export class ContentTemplatesHealthIndicator {
  public constructor(private readonly templates: ContentTemplateRepository) {}

  public check(): {
    readonly component: string;
    readonly status: 'up' | 'down';
  } {
    void this.templates;
    return { component: 'content-templates', status: 'up' };
  }
}
