import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SchedulingModule } from './scheduling.module';

describe('SchedulingModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        SchedulingModule,
      ],
    }).compile();
    expect(module.get(SchedulingModule)).toBeDefined();
    await module.close();
  });
});
