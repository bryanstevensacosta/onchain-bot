import { Test } from '@nestjs/testing';
import { IngestionModule } from './ingestion.module';

describe('IngestionModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [IngestionModule],
    }).compile();
    expect(module.get(IngestionModule)).toBeDefined();
    await module.close();
  });
});
