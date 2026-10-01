import { ContentTemplatesHealthIndicator } from './content-templates-health.indicator';
import { InMemoryContentTemplateRepository } from '../infrastructure/repositories/in-memory-content-template.repository';

describe('ContentTemplatesHealthIndicator', () => {
  it('reports up', () => {
    const indicator = new ContentTemplatesHealthIndicator(
      new InMemoryContentTemplateRepository(),
    );
    expect(indicator.check()).toEqual({
      component: 'content-templates',
      status: 'up',
    });
  });
});
