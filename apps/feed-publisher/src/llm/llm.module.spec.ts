import { Test } from '@nestjs/testing';
import { LlmModule } from './llm.module';

describe('LlmModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [LlmModule],
    }).compile();
    expect(module.get(LlmModule)).toBeDefined();
    await module.close();
  });
});
