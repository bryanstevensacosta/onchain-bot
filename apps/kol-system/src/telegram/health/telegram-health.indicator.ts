import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * P21 hook point: publishing health indicator.
 *
 * Component name is `publishing` (the composite-health contract in the
 * cutover plan addresses the pipeline stage, not the `src/telegram/`
 * directory). Provided + exported, unwired until composite health (gap 3).
 */
@Injectable()
export class TelegramHealthIndicator {
  public check(): ComponentHealth {
    return { component: 'publishing', status: 'up' };
  }
}
