import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ThreadsMatchingConfig } from 'threads/domain/threads-matching-config.entity';

/**
 * Threads matching config + health (6-field view parity).
 */
@Controller(['threads/matching', 'feed-threads-publisher/matching'])
export class ThreadsMatchingController {
  private readonly config = new ThreadsMatchingConfig(true);

  @Get('config')
  public getConfig(): { enabled: boolean } {
    return { enabled: this.config.enabled };
  }

  @Patch('config')
  public patchConfig(
    @Body() body: { enabled?: boolean },
  ): { enabled: boolean } {
    if (typeof body.enabled === 'boolean') {
      this.config.enabled = body.enabled;
    }
    return { enabled: this.config.enabled };
  }

  @Get('health')
  public health(): {
    enabled: boolean;
    queuePending: number;
    lastTickAt: string | null;
    lastEnqueued: number;
    lastSkipped: number;
    status: string;
  } {
    return {
      enabled: this.config.enabled,
      queuePending: 0,
      lastTickAt: null,
      lastEnqueued: 0,
      lastSkipped: 0,
      status: 'ok',
    };
  }
}
