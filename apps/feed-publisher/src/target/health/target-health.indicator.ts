import { Injectable } from '@nestjs/common';

/**
 * P21 health hook for `src/target/` (threads-publisher plan Fase 2
 * todo 10).
 */
@Injectable()
export class TargetHealthIndicator {
  public check(): { component: string; status: 'up' | 'down' } {
    return { component: 'target', status: 'up' };
  }
}
