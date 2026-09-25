import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueueController } from './queue.controller';
import { QueueManager } from '../../application/services/queue-manager.service';
import { QueueHealthState } from '../../application/state/queue-health.state';
import { PublisherQueueRepository } from '../../domain/ports/publisher-queue.repository';
import { InMemoryPublisherQueueRepository } from '../../infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';

describe('QueueController', () => {
  async function build() {
    const module = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        QueueManager,
        QueueHealthState,
        {
          provide: PublisherQueueRepository,
          useClass: InMemoryPublisherQueueRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => fallback,
          },
        },
      ],
    }).compile();
    const controller = module.get(QueueController);
    const manager = module.get(QueueManager);
    return { module, controller, manager };
  }

  it('reports stats with a pending counter', async () => {
    const { controller, manager, module } = await build();
    await manager.enqueue(
      PublisherQueueEntry.create({
        contentType: 'crypto-news',
        channelId: '-1001',
        messageId: 1,
        rawContent: 'hello',
      }),
    );
    const stats = await controller.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.total).toBe(1);
    await module.close();
  });

  it('lists entries newest-first and deletes by id', async () => {
    const { controller, manager, module } = await build();
    const entry = PublisherQueueEntry.create({
      contentType: 'crypto-news',
      channelId: '-1001',
      messageId: 1,
      rawContent: 'hello',
    });
    await manager.enqueue(entry);
    const listed = await controller.list({ limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(entry.id);
    await controller.remove(entry.id);
    const stats = await controller.getStats();
    expect(stats.total).toBe(0);
    await module.close();
  });
});
