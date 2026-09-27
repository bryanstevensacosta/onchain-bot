import { Injectable } from '@nestjs/common';

@Injectable()
export class FeedThreadsHealthIndicator {
  public async check(): Promise<{ component: string; status: 'up' | 'down' }> {
    return { component: 'feed-threads', status: 'up' };
  }
}
