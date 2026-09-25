import { Test } from '@nestjs/testing';
import { SessionsModule } from './sessions.module';

describe('SessionsModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [SessionsModule],
    }).compile();
    expect(module.get(SessionsModule)).toBeDefined();
    await module.close();
  });
});
