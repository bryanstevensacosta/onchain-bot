import { Test, TestingModule } from '@nestjs/testing';
import { MARKET_DATA_PROVIDERS } from './enrichment.tokens';
import { MarketDataPort } from './domain/ports/market-data.port';
import { LocalCascadeMarketDataAdapter } from './infrastructure/adapters/local-cascade-market-data.adapter';
import { HttpMarketDataAdapter } from './infrastructure/adapters/http-market-data.adapter';
import { EnrichmentModule } from './enrichment.module';

describe('EnrichmentModule (USE_DATA_SERVICE_API selector)', () => {
  const PREV = process.env.USE_DATA_SERVICE_API;
  let moduleRef: TestingModule | null = null;

  afterEach(async () => {
    if (PREV === undefined) {
      delete process.env.USE_DATA_SERVICE_API;
    } else {
      process.env.USE_DATA_SERVICE_API = PREV;
    }
    if (moduleRef) {
      await moduleRef.close();
      moduleRef = null;
    }
  });

  it('USE_DATA_SERVICE_API=false -> local-cascade (default)', async () => {
    process.env.USE_DATA_SERVICE_API = 'false';
    moduleRef = await Test.createTestingModule({
      imports: [EnrichmentModule],
    }).compile();

    const providers = moduleRef.get<MarketDataPort[]>(MARKET_DATA_PROVIDERS);

    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(LocalCascadeMarketDataAdapter);
  });

  it('USE_DATA_SERVICE_API unset -> local-cascade (default)', async () => {
    delete process.env.USE_DATA_SERVICE_API;
    moduleRef = await Test.createTestingModule({
      imports: [EnrichmentModule],
    }).compile();

    const providers = moduleRef.get<MarketDataPort[]>(MARKET_DATA_PROVIDERS);

    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(LocalCascadeMarketDataAdapter);
  });

  it('USE_DATA_SERVICE_API=true -> http-market-data primary + local fallback', async () => {
    process.env.USE_DATA_SERVICE_API = 'true';
    moduleRef = await Test.createTestingModule({
      imports: [EnrichmentModule],
    }).compile();

    const providers = moduleRef.get<MarketDataPort[]>(MARKET_DATA_PROVIDERS);

    expect(providers).toHaveLength(2);
    expect(providers[0]).toBeInstanceOf(HttpMarketDataAdapter);
    expect(providers[1]).toBeInstanceOf(LocalCascadeMarketDataAdapter);
  });
});
