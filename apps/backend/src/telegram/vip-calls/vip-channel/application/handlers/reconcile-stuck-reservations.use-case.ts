import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishedCallRepository } from 'telegram/shared';

export interface ReconcileStuckReservationsResult {
  readonly processed: number;
  readonly published: number;
  readonly failed: number;
}

export interface ReconcileStuckReservationsOptions {
  readonly olderThanMs?: number;
  readonly limit?: number;
}

@Injectable()
export class ReconcileStuckReservationsUseCase {
  private readonly logger = new Logger(ReconcileStuckReservationsUseCase.name);

  public constructor(
    @Inject(PublishedCallRepository)
    private readonly repo: PublishedCallRepository,
    private readonly config: ConfigService,
  ) {}

  public async execute(
    opts: ReconcileStuckReservationsOptions = {},
  ): Promise<ReconcileStuckReservationsResult> {
    const olderThanMs = opts.olderThanMs ?? 60_000;
    const limit = opts.limit ?? 100;
    const stuck = await this.repo.findStuckReservations(olderThanMs, limit);

    let published = 0;
    let failed = 0;

    for (const row of stuck) {
      if (!row.isReserved) {
        continue;
      }
      const id = row.id;
      const correlationId = row.correlationId ?? `reconcile-${id}`;
      try {
        if (row.telegramMessageId !== null) {
          await this.repo.finalize(id, {
            telegramMessageId: row.telegramMessageId,
            status: 'PUBLISHED',
          });
          published++;
          this.logger.log(
            `[${correlationId}] reconcile finalized RESERVED→PUBLISHED id=${id} telegramMessageId=${row.telegramMessageId}`,
          );
        } else {
          await this.repo.markFailed(
            id,
            'reconciler: sendMessage never returned',
          );
          failed++;
          this.logger.log(
            `[${correlationId}] reconcile finalized RESERVED→FAILED id=${id} reason=sendMessage-never-returned`,
          );
        }
      } catch (err) {
        this.logger.error(
          `[${correlationId}] reconcile failed for id=${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { processed: stuck.length, published, failed };
  }

  public isEnabled(): boolean {
    const flag = this.config.get<boolean>(
      'app.publishing.reconciliation.enabled',
    );
    return flag !== false;
  }
}
