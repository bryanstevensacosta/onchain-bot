import { Test } from '@nestjs/testing';
import { ChainModule } from './chain.module';

describe('ChainModule', () => {
  it('boots as a stub (catalog + probers land in todo 2)', async () => {
    const module = await Test.createTestingModule({
      imports: [ChainModule],
    }).compile();
    expect(module.get(ChainModule)).toBeDefined();
  });
});
