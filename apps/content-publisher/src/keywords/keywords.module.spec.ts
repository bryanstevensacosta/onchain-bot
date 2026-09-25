import { Test } from '@nestjs/testing';
import { KeywordsModule } from './keywords.module';

describe('KeywordsModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [KeywordsModule],
    }).compile();
    expect(module.get(KeywordsModule)).toBeDefined();
    await module.close();
  });
});
