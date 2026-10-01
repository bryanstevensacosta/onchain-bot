import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram.module';

describe('TelegramModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TelegramModule,
      ],
    }).compile();
    expect(module.get(TelegramModule)).toBeDefined();
    await module.close();
  });
});
