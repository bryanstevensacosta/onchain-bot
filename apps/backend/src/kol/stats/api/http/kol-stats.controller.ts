import { Controller, Get } from '@nestjs/common';

/**
 * Stats BC controller (Fase 5 of the kol-refactor plan — stub).
 *
 * Endpoints are planned but not implemented yet. They will read from
 * `KolReputationRepository` and `CallPerformanceRepository` once there
 * is enough production data.
 *
 * Until then, the frontend uses `/kol/reputation/kols/top`
 * directly for the leaderboard.
 */
@Controller('telegram-kol/stats')
export class KolStatsController {
  @Get('kol-leaderboard')
  public kolLeaderboard(): Promise<{ readonly note: string }> {
    return Promise.resolve({
      note: 'Stub — see /kol/reputation/kols/top for now',
    });
  }

  @Get('top-calls')
  public topCalls(): Promise<{ readonly note: string }> {
    return Promise.resolve({
      note: 'Stub — Fase 5 pendiente',
    });
  }

  @Get('roi-trends')
  public roiTrends(): Promise<{ readonly note: string }> {
    return Promise.resolve({
      note: 'Stub — Fase 5 pendiente',
    });
  }

  @Get('alpha-callers')
  public alphaCallers(): Promise<{ readonly note: string }> {
    return Promise.resolve({
      note: 'Stub — Fase 5 pendiente',
    });
  }
}
