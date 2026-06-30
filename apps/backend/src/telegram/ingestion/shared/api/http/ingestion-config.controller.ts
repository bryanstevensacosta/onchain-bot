import { Controller, Get } from '@nestjs/common';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';

@Controller('ingestion')
export class IngestionConfigController {
  public constructor(private readonly config: IngestionSafetyConfig) {}

  @Get('config')
  public getConfig(): Record<string, number> {
    return {
      maxChannels: this.config.maxChannels,
      pollIntervalBaseMs: this.config.pollIntervalBaseMs,
      jitterPercent: this.config.jitterPercent,
      sleepStartUtc: this.config.sleepStartUtc,
      sleepEndUtc: this.config.sleepEndUtc,
      floodInitialMs: this.config.floodInitialMs,
      floodMultiplier: this.config.floodMultiplier,
      floodMaxMs: this.config.floodMaxMs,
      floodMaxAttempts: this.config.floodMaxAttempts,
    };
  }
}
