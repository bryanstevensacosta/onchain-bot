import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SessionsModule } from './sessions.module';

describe('SessionsModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        SessionsModule,
      ],
    }).compile();
    expect(module.get(SessionsModule)).toBeDefined();
    await module.close();
  });
});
