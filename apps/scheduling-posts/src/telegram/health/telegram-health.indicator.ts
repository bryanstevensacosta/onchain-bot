import { Injectable, Optional } from '@nestjs/common';
import { SchedulingGatewaySenderPort } from '../domain/ports/scheduling-gateway-sender.port';

/**
 * P21 hook point: telegram depth health (never liveness). Up when the
 * gateway sender is wired; down only when the binding itself is
 * missing (transport failures are per-send, not liveness).
 */
@Injectable()
export class TelegramHealthIndicator {
  public constructor(
    @Optional()
    private readonly gateway?: SchedulingGatewaySenderPort,
  ) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    return {
      component: 'telegram',
      status: this.gateway ? 'up' : 'down',
    };
  }
}
