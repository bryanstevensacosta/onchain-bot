import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from './providers.module';
import { ProviderRegistryService } from '../provider-registry.service';

/**
 * Failing-first spec (Tramo 3, todo 4, C-DATA-01).
 *
 * The 13 physically extracted adapters wire as Nest modules and stay
 * registered in the provider health registry (one descriptor per adapter).
 */
describe('ProvidersModule (13 adapters, todo 4)', () => {
  it('boots with all 13 adapter modules', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ProvidersModule,
      ],
    }).compile();
    expect(module.get(ProvidersModule)).toBeDefined();
    await module.close();
  });

  it('keeps every adapter registered in the health registry', () => {
    const registry = new ProviderRegistryService();
    expect(registry.listProviders()).toHaveLength(13);
  });
});
