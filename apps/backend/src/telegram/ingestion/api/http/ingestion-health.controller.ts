import { Controller, Get } from '@nestjs/common';
import { IngestionSafetyConfig } from 'telegram/ingestion/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/infrastructure/services/flood-wait-counter.service';

export interface IngestionHealthDto {
  readonly activeChannels: number;
  readonly totalSeededChannels: number;
  readonly maxSafeChannels: number;
  readonly floodWaitCount24h: number;
  readonly floodWaitMaxSeconds24h: number;
  readonly isSleeping: boolean;
  readonly sleepWindowStart: number;
  readonly sleepWindowEnd: number;
  readonly pollIntervalMs: number;
  readonly lastPollAt: string | null;
}

@Controller('ingestion')
export class IngestionHealthController {
  private lastPollAt: Date | null = null;

  constructor(
    private readonly safetyConfig: IngestionSafetyConfig,
    private readonly sleepWindow: SleepWindowService,
    private readonly floodWait: FloodWaitCounterService,
  ) {}

  @Get('health')
  public getHealth(): IngestionHealthDto {
    return {
      activeChannels: 0,
      totalSeededChannels: 0,
      maxSafeChannels: this.safetyConfig.maxChannels,
      floodWaitCount24h: this.floodWait.count24h,
      floodWaitMaxSeconds24h: this.floodWait.maxSeconds24h,
      isSleeping: this.sleepWindow.isAsleep(),
      sleepWindowStart: this.safetyConfig.sleepStartUtc,
      sleepWindowEnd: this.safetyConfig.sleepEndUtc,
      pollIntervalMs: this.safetyConfig.pollIntervalBaseMs,
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
    };
  }

  public markPoll(): void {
    this.lastPollAt = new Date();
  }
}
