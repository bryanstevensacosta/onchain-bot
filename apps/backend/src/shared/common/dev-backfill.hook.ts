import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';

@Injectable()
export class DevBackfillHook implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevBackfillHook.name);

  public constructor(
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const nodeEnv = this.config.get<string>('app.nodeEnv', 'development');
    if (nodeEnv !== 'development') return;
    this.logger.log('Dev mode: running startup backfill');

    try {
      const kolRepo = this.moduleRef.get(KolRepository, { strict: false });
      const ingestion = this.moduleRef.get(KolIngestionOrchestratorUseCase, {
        strict: false,
      });
      const all = await kolRepo.findAll();
      const active = all.filter((k) => k.lifecycleStatus === 'ACTIVE');
      if (active.length === 0) {
        this.logger.log('No ACTIVE KOLs');
        return;
      }

      this.logger.log(
        `Backfilling ${active.length}/${all.length} ACTIVE KOLs (limit=5 each)`,
      );
      let total = 0;
      for (const kol of active) {
        try {
          const result = await ingestion.backfillKol(kol.id, 5);
          total += result.total;
          this.logger.log(
            `  ${kol.id}: +${result.ingested}/${result.total} msgs`,
          );
        } catch (err) {
          this.logger.warn(
            `  ${kol.id}: backfill failed — ${(err as Error).message}`,
          );
        }
      }
      this.logger.log(`Startup backfill done: ${total} messages`);
    } catch (err) {
      this.logger.warn(
        `Startup backfill unavailable: ${(err as Error).message}`,
      );
    }
  }
}
