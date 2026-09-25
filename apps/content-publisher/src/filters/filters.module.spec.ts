import { Test } from '@nestjs/testing';
import { FiltersModule } from './filters.module';

describe('FiltersModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [FiltersModule],
    }).compile();
    expect(module.get(FiltersModule)).toBeDefined();
    await module.close();
  });
});
