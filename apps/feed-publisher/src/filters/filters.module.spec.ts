import { Test } from '@nestjs/testing';
import { FiltersModule } from './filters.module';
import { ChannelFilterRepository } from './application/ports/channel-filter.repository';
import { ContentFilterService } from './application/services/content-filter.service';
import { ContentFilterUseCases } from './application/use-cases/content-filter.use-cases';

describe('FiltersModule', () => {
  it('wires the filters graph (todo 3)', async () => {
    const module = await Test.createTestingModule({
      imports: [FiltersModule],
    }).compile();
    expect(module.get(FiltersModule)).toBeDefined();
    expect(module.get(ChannelFilterRepository)).toBeDefined();
    expect(module.get(ContentFilterService)).toBeDefined();
    expect(module.get(ContentFilterUseCases)).toBeDefined();
    await module.close();
  });
});
