import { Test } from '@nestjs/testing';
import { MatchingConfigController } from './matching-config.controller';
import { MatchingConfigRepository } from '../../domain/ports/matching-config.repository';
import { MatchingHealthState } from '../../application/state/matching-health.state';
import { InMemoryMatchingConfigRepository } from '../../infrastructure/persistence/in-memory/in-memory-matching-config.repository';
import { InMemoryMatchedMessageCollector } from '../../infrastructure/feed/in-memory-matched-message.collector';

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
        InMemoryMatchedMessageCollector,
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
