import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue.module';
import { QueueManager } from './application/services/queue-manager.service';
import { EnqueueMatchingMessageUseCase } from './application/use-cases/enqueue-matching-message.use-case';
import { ProcessNextQueuedArticleUseCase } from './application/use-cases/process-next-queued-article.use-case';
import { PublisherQueueRepository } from './domain/ports/publisher-queue.repository';
import { QueuedArticleRendererPort } from './application/ports/queued-article-renderer.port';
import { QueuedArticleDispatcherPort } from './application/ports/queued-article-dispatcher.port';
import { QueueMatchedMessageAdapter } from './infrastructure/feed/queue-matched-message.adapter';

describe('QueueModule', () => {
  it('wires the unified queue graph (todo 4)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        QueueModule,
      ],
    }).compile();
    expect(module.get(QueueModule)).toBeDefined();
    expect(module.get(QueueManager)).toBeDefined();
    expect(module.get(PublisherQueueRepository)).toBeDefined();
    expect(module.get(EnqueueMatchingMessageUseCase)).toBeDefined();
    expect(module.get(ProcessNextQueuedArticleUseCase)).toBeDefined();
    expect(module.get(QueuedArticleRendererPort)).toBeDefined();
    expect(module.get(QueuedArticleDispatcherPort)).toBeDefined();
    expect(module.get(QueueMatchedMessageAdapter)).toBeDefined();
    await module.close();
  });
});
