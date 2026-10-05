import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue.module';

describe('QueueModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        QueueModule,
      ],
    }).compile();
    expect(module.get(QueueModule)).toBeDefined();
    await module.close();
  });
});
