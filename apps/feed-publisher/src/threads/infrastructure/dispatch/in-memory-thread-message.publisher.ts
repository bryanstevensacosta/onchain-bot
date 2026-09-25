import { Injectable } from '@nestjs/common';
import type {
  ThreadMessagePublishInput,
  ThreadMessagePublishOutcome,
} from '../../domain/ports/thread-message-publisher.port';
import { ThreadMessagePublisherPort } from '../../domain/ports/thread-message-publisher.port';

/**
 * In-memory `ThreadMessagePublisherPort` — the LIVE binding until
 * todo 7 binds the real Threads Bot API adapter here.
 *
 * Records every attempted publish and reports success (same pattern
 * as the queue/scheduling in-memory dispatchers). Never posts outside
 * tests: there is no Threads transport in v1.
 */
@Injectable()
export class InMemoryThreadMessagePublisher extends ThreadMessagePublisherPort {
  public readonly sent: ThreadMessagePublishInput[] = [];

  public async publish(
    input: ThreadMessagePublishInput,
  ): Promise<ThreadMessagePublishOutcome> {
    this.sent.push(input);
    return {
      outcome: 'ok',
      remoteId: `threads:${input.threadId}:${input.index}`,
    };
  }
}
