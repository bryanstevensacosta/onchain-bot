import { Injectable } from '@nestjs/common';
import {
  KolWindowStat,
  type RankingWindow,
} from '../../domain/entities/kol-window-stat.entity';
import { KolWindowStatRepository } from '../../application/ports/kol-window-stat.repository';

/**
 * In-memory `KolWindowStatRepository` (Tramo 1 stand-in; the TypeORM
 * entity + migration land with the persistence todo).
 *
 * Upsert by `caller:window` — each `rebuild()` overwrites the same rows.
 */
@Injectable()
export class InMemoryKolWindowStatRepository extends KolWindowStatRepository {
  private readonly rows = new Map<string, KolWindowStat>();

  public async save(stat: KolWindowStat): Promise<void> {
    this.rows.set(stat.id, stat);
  }

  public async findByWindow(window: RankingWindow): Promise<KolWindowStat[]> {
    return [...this.rows.values()].filter((stat) => stat.window === window);
  }

  public async findByCallerWindow(
    caller: string,
    window: RankingWindow,
  ): Promise<KolWindowStat | null> {
    return this.rows.get(KolWindowStat.buildId(caller, window)) ?? null;
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
