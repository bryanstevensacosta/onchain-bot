import { Test } from '@nestjs/testing';
import { MatchingModule } from './matching.module';

describe('MatchingModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [MatchingModule],
    }).compile();
    expect(module.get(MatchingModule)).toBeDefined();
    await module.close();
  });
});
