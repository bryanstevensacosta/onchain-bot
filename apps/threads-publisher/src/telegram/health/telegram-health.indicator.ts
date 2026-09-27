import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramHealthIndicator {
  public async check(): Promise<{ component: string; status: 'up' | 'down' }> {
    return { component: 'telegram', status: 'up' };
  }
}
