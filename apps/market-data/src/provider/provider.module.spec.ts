import { Test } from '@nestjs/testing';
import { ProviderModule } from './provider.module';

describe('ProviderModule', () => {
  it('boots as a stub (health/latency registry lands in todo 2)', async () => {
    const module = await Test.createTestingModule({
      imports: [ProviderModule],
    }).compile();
    expect(module.get(ProviderModule)).toBeDefined();
  });
});
