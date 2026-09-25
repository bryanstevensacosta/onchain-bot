import { Test } from '@nestjs/testing';
import { TokenModule } from './token.module';

describe('TokenModule (deprecated alias, P45)', () => {
  it('boots as an alias of AddressModule (token = kind=token path)', async () => {
    const module = await Test.createTestingModule({
      imports: [TokenModule],
    }).compile();
    expect(module.get(TokenModule)).toBeDefined();
  });
});
