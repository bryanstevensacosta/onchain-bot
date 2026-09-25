import { Test } from '@nestjs/testing';
import { TelegramModule } from './telegram.module';

describe('TelegramModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [TelegramModule],
    }).compile();
    expect(module.get(TelegramModule)).toBeDefined();
    await module.close();
  });
});
