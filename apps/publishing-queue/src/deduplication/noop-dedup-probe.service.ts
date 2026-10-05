import { Injectable, Logger } from '@nestjs/common';
import { DeduplicationService } from './application/services/deduplication.service';

/**
 * Fail-open dedup probe (R-b1): never reports a duplicate, `markAsSeen`
 * is a no-op. The enqueue path wraps every probe call in fail-open
 * handling, so this keeps the moved queue draining while the real
 * cascade stays in feed-publisher (R6). B1 dual replaces this binding
 * with a thin HTTP probe against the feed-publisher owner.
 */
@Injectable()
export class NoopDedupProbe extends DeduplicationService {
  private readonly logger = new Logger(NoopDedupProbe.name);

  public async checkDuplicate(input: {
    readonly source: string;
    readonly channelId: string;
    readonly messageId: number;
    readonly content: string;
  }): Promise<{ readonly isDuplicate: false }> {
    void input;
    return { isDuplicate: false };
  }

  public async markAsSeen(input: {
    readonly source: string;
    readonly channelId: string;
    readonly messageId: number;
    readonly content: string;
    readonly entryId: string;
  }): Promise<void> {
    void input;
    this.logger.debug('dedup probe unwired (R-b1): markAsSeen skipped');
  }
}
