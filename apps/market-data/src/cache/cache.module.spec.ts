import { Test } from '@nestjs/testing';
import { CacheModule } from './cache.module';

describe('CacheModule', () => {
  it('boots as a stub (Redis+memory+interceptor land in todo 2)', async () => {
    const module = await Test.createTestingModule({
      imports: [CacheModule],
    }).compile();
    expect(module.get(CacheModule)).toBeDefined();
  });
});
