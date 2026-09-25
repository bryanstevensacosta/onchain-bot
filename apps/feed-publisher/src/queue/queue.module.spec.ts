import { Test } from '@nestjs/testing';
import { QueueModule } from './queue.module';

describe('QueueModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [QueueModule],
    }).compile();
    expect(module.get(QueueModule)).toBeDefined();
    await module.close();
  });
});
