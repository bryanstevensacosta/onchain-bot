import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from './llm.module';

describe('LlmModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LlmModule,
      ],
    }).compile();
    expect(module.get(LlmModule)).toBeDefined();
    await module.close();
  });
});
