import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconcileStuckReservationsUseCase } from '../../application/handlers/reconcile-stuck-reservations.use-case';

@Injectable()
export class ReconcileStuckReservationsScheduler {
  private readonly logger = new Logger(
    ReconcileStuckReservationsScheduler.name,
  );

  public constructor(
    private readonly useCase: ReconcileStuckReservationsUseCase,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  public async tick(): Promise<void> {
    const enabled = this.config.get<boolean>(
      'app.publishing.reconciliation.enabled',
    );
    if (enabled === false) {
      return;
    }
    try {
      const result = await this.useCase.execute();
      if (result.processed > 0) {
        this.logger.log(
          `reconcile tick: processed=${result.processed} published=${result.published} failed=${result.failed}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `reconcile tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
