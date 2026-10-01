import { Injectable } from '@nestjs/common';

@Injectable()
export class ThreadsHealthIndicator {
  public async check(): Promise<{ component: string; status: 'up' | 'down' }> {
    return { component: 'threads', status: 'up' };
  }
}
