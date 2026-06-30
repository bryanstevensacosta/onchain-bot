import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DashboardKpisCachePort } from '../ports/dashboard-kpis-cache.port';
import { KpisUpdatedEventPublisher } from '../ports/kpis-updated-event.publisher';
import { KpisUpdatedEvent } from 'dashboard/domain/events/kpis-updated.event';

/**
 * Subscribes to the 4 pipeline events that mutate dashboard counts and
 * invalidates the cache + emits a 'dashboard.kpis.updated' WS event.
 *
 * The cache TTL (1s default) is the upper bound on staleness when
 * event delivery is missed. The WS push is the lower bound (<1s) when
 * the event bus is healthy.
 */
@Injectable()
export class RefreshKpisService {
  private readonly logger = new Logger(RefreshKpisService.name);

  public constructor(
    private readonly cache: DashboardKpisCachePort,
    private readonly publisher: KpisUpdatedEventPublisher,
  ) {}

  @OnEvent('normalization.call.normalized', { async: true })
  public async onNormalized(): Promise<void> {
    await this.refresh();
  }

  @OnEvent('vip-call.approval.approved', { async: true })
  public async onApproved(): Promise<void> {
    await this.refresh();
  }

  @OnEvent('vip-call.approval.rejected', { async: true })
  public async onRejected(): Promise<void> {
    await this.refresh();
  }

  @OnEvent('publishing.telegram.published', { async: true })
  public async onPublished(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      await this.cache.invalidate();
      await this.publisher.publish(new KpisUpdatedEvent());
    } catch (err) {
      this.logger.error(
        `RefreshKpisService.refresh failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
