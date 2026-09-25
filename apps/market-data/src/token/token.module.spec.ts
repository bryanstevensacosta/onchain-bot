import { Test } from '@nestjs/testing';
import { TokenModule } from './token.module';

describe('TokenModule', () => {
  it('boots as a stub (aggregators land in todo 3)', async () => {
    const module = await Test.createTestingModule({
      imports: [TokenModule],
    }).compile();
    expect(module.get(TokenModule)).toBeDefined();
  });
});
