import { Test, TestingModule } from '@nestjs/testing';
import { SharedModule } from './shared.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { CachePort } from './cache/cache.port';
import { EventBusPort } from './messaging/event-bus';
import { MetricsService } from './monitoring/metrics.service';
import { SharedHttpClient } from './http/http-client';

describe('SharedModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [SharedModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('compiles and provides the guard, filter and ports', () => {
    expect(module.get(SharedModule)).toBeDefined();
    expect(module.get(ApiKeyGuard)).toBeInstanceOf(ApiKeyGuard);
    expect(module.get(DomainExceptionFilter)).toBeInstanceOf(
      DomainExceptionFilter,
    );
    expect(module.get(MetricsService)).toBeInstanceOf(MetricsService);
    expect(module.get(SharedHttpClient)).toBeInstanceOf(SharedHttpClient);
    expect(module.get(CachePort)).toBeDefined();
    expect(module.get(EventBusPort)).toBeDefined();
  });
});
