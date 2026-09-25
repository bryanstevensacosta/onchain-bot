import { Test } from '@nestjs/testing';
import { DeduplicationModule } from './deduplication.module';

describe('DeduplicationModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [DeduplicationModule],
    }).compile();
    expect(module.get(DeduplicationModule)).toBeDefined();
    await module.close();
  });
});
