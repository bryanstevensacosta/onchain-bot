import { Test } from '@nestjs/testing';
import { SchedulingModule } from './scheduling.module';

describe('SchedulingModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [SchedulingModule],
    }).compile();
    expect(module.get(SchedulingModule)).toBeDefined();
    await module.close();
  });
});
