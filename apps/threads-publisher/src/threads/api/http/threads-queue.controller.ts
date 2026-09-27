import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { EnqueueThreadsMessageUseCase } from 'threads/application/enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from 'threads/application/process-next-threads-article.use-case';
import { ThreadsQueueRepository } from 'threads/ports/threads-queue.repository';
import { ThreadsLlmConfig } from 'threads/domain/threads-llm-config.entity';
import { ThreadsKeyword } from 'threads/domain/threads-keyword.entity';

/**
 * Threads queue + matching HTTP (backend parity, dual-serve names).
 * Serves /threads-publisher/queue/* and /feed-threads-publisher/queue/*.
 */
@Controller(['threads-publisher/queue', 'feed-threads-publisher/queue'])
export class ThreadsQueueController {
  public constructor(
    private readonly queueRepo: ThreadsQueueRepository,
    private readonly enqueue: EnqueueThreadsMessageUseCase,
    private readonly drain: ProcessNextThreadsArticleUseCase,
  ) {}

  @Get()
  public async list(): Promise<unknown> {
    return this.queueRepo.listPending(50);
  }

  @Get('counts')
  public async counts(): Promise<{
    pending: number;
    publishedToday: number;
    remaining: number;
  }> {
    const pending = await this.queueRepo.countPending();
    return { pending, publishedToday: 0, remaining: 60 };
  }

  @Post('enqueue')
  public async enqueueMessage(
    @Body() body: { channelId: string; messageId: number; content: string },
  ): Promise<unknown> {
    return this.enqueue.execute({
      channelId: body.channelId,
      messageId: body.messageId,
      content: body.content ?? '',
      matchedKeywords: [new ThreadsKeyword({ id: 'manual', phrase: 'manual' })],
    });
  }

  @Post('drain')
  public async drainOnce(): Promise<unknown> {
    return this.drain.execute(ThreadsLlmConfig.default());
  }

  @Delete(':id')
  public async cancel(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.queueRepo.delete(id);
    return { deleted: true };
  }

  @Patch('config')
  public async patchConfig(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
