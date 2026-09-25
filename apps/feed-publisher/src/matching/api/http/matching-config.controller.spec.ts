import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatchingConfigController } from './matching-config.controller';
import { MatchingConfigRepository } from '../../domain/ports/matching-config.repository';
import { MatchingHealthState } from '../../application/state/matching-health.state';
import { InMemoryMatchingConfigRepository } from '../../infrastructure/persistence/in-memory/in-memory-matching-config.repository';
import { QueueManager } from '../../../queue/application/services/queue-manager.service';
import { PublisherQueueRepository } from '../../../queue/domain/ports/publisher-queue.repository';
import { InMemoryPublisherQueueRepository } from '../../../queue/infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';

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
        QueueManager,
        {
          provide: PublisherQueueRepository,
          useClass: InMemoryPublisherQueueRepository,
        },
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
