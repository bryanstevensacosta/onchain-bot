import { Test } from '@nestjs/testing';
import { ThreadsQueueController } from './threads-queue.controller';
import { ThreadsQueueRepository } from 'threads/ports/threads-queue.repository';
import { InMemoryThreadsQueueRepository } from 'threads/infrastructure/in-memory-threads-queue.repository';
import { EnqueueThreadsMessageUseCase } from 'threads/application/enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from 'threads/application/process-next-threads-article.use-case';
import { ThreadsApiPublisherPort } from 'threads/ports/threads-api-publisher.port';

describe('ThreadsQueueController', () => {
  it('enqueues, counts and drains via HTTP facade', async () => {
    const mod = await Test.createTestingModule({
      controllers: [ThreadsQueueController],
      providers: [
        InMemoryThreadsQueueRepository,
        {
          provide: ThreadsQueueRepository,
          useClass: InMemoryThreadsQueueRepository,
        },
        EnqueueThreadsMessageUseCase,
        ProcessNextThreadsArticleUseCase,
        {
          provide: ThreadsApiPublisherPort,
          useValue: {
            publish: jest.fn().mockResolvedValue({
              ok: false,
              status: 'FAILED',
              reason: 'REFUSE',
              reintentable: false,
            }),
          },
        },
      ],
    }).compile();
    const ctrl = mod.get(ThreadsQueueController);
    await ctrl.enqueueMessage({
      channelId: '-1001',
      messageId: 99,
      content: 'hello threads',
    });
    const counts = await ctrl.counts();
    expect(counts.pending).toBe(1);
    const list = (await ctrl.list()) as unknown[];
    expect(list).toHaveLength(1);
    await mod.close();
  });
});
