import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatchingConfigController } from './matching-config.controller';
import { MatchingConfigRepository } from '@/matching/domain/ports/matching-config.repository';
import { MatchingHealthState } from '@/matching/application/state/matching-health.state';
import { InMemoryMatchingConfigRepository } from '@/matching/infrastructure/persistence/in-memory/in-memory-matching-config.repository';

describe('MatchingConfigController', () => {
  async function build() {
    const module = await Test.createTestingModule({
      controllers: [MatchingConfigController],
      providers: [
        {
          provide: MatchingConfigRepository,
          useClass: InMemoryMatchingConfigRepository,
        },
        MatchingHealthState,
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, fallback?: unknown) => fallback,
          },
        },
      ],
    }).compile();
    return { module, controller: module.get(MatchingConfigController) };
  }

  it('reads config and toggles the enabled flag', async () => {
    const { controller, module } = await build();
    const initial = await controller.getConfig();
    expect(initial.enabled).toBe(false);
    const updated = await controller.updateConfig({ enabled: true });
    expect(updated.enabled).toBe(true);
    await module.close();
  });

  it('reports pipeline health with the frozen view shape', async () => {
    const { controller, module } = await build();
    const health = await controller.getHealth();
    expect(health).toMatchObject({
      enabled: false,
      lastTickAt: null,
      lastFetchOk: null,
      consecutiveFetchFailures: 0,
      lastEnqueuedAt: null,
    });
    expect(typeof health.queuePending).toBe('number');
    await module.close();
  });
});
