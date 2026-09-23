import { Controller, Get } from '@nestjs/common';

// Static snapshot of the deleted backend IngestionSafetyConfig defaults.
// Anti-ban tuning now lives in ingestion-telegram; this endpoint keeps its
// shape for existing consumers (desvinculacion T6, anticipada en T5 para
// borrar el bloque MTProto sin romper el build).
const LEGACY_SAFETY_DEFAULTS: Record<string, number> = {
  maxChannels: 50,
  pollIntervalBaseMs: 90000,
  jitterPercent: 0.3,
  sleepStartUtc: 4,
  sleepEndUtc: 8,
  floodInitialMs: 5000,
  floodMultiplier: 2,
  floodMaxMs: 3600000,
  floodMaxAttempts: 5,
};

@Controller('ingestion')
export class IngestionConfigController {
  @Get('config')
  public getConfig(): Record<string, number> {
    return { ...LEGACY_SAFETY_DEFAULTS };
  }
}
