import { Test } from '@nestjs/testing';
import { ThreadsModule } from './threads.module';

describe('ThreadsModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [ThreadsModule],
    }).compile();
    expect(module.get(ThreadsModule)).toBeDefined();
    await module.close();
  });
});
