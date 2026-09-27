import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProcessNextThreadsArticleUseCase } from './process-next-threads-article.use-case';
import { ThreadsLlmConfig } from '../domain/threads-llm-config.entity';

/**
 * Drain cron (backend parity): every-10-min with advisory lock id
 * THREADS_PUBLISHER_ADVISORY_LOCK_ID=7_421_372, gated by publishingEnabled.
 */
@Injectable()
export class ThreadsPublisherCronScheduler {
  public static readonly THREADS_PUBLISHER_ADVISORY_LOCK_ID = 7_421_372;
  public static readonly CRON_EXPRESSION = '*/10 * * * *';

  private readonly logger = new Logger(ThreadsPublisherCronScheduler.name);
  private running = false;

  public constructor(
    private readonly drain: ProcessNextThreadsArticleUseCase,
  ) {}

  @Cron('*/10 * * * *')
  public async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const res = await this.drain.execute(ThreadsLlmConfig.default());
      this.logger.debug(
        `threads drain tick lock=${ThreadsPublisherCronScheduler.THREADS_PUBLISHER_ADVISORY_LOCK_ID} ${res.reason}`,
      );
    } finally {
      this.running = false;
    }
  }
}
