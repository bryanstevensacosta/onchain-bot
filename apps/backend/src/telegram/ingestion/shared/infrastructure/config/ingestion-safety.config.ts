import { Injectable } from '@nestjs/common';

@Injectable()
export class IngestionSafetyConfig {
  public readonly maxChannels: number;
  public readonly pollIntervalBaseMs: number;
  public readonly jitterPercent: number;
  public readonly sleepStartUtc: number;
  public readonly sleepEndUtc: number;
  public readonly floodInitialMs: number;
  public readonly floodMultiplier: number;
  public readonly floodMaxMs: number;
  public readonly floodMaxAttempts: number;

  constructor() {
    this.maxChannels =
      parseInt(process.env.INGESTION_MAX_CHANNELS ?? '50', 10) || 50;
    this.pollIntervalBaseMs =
      parseInt(process.env.INGESTION_POLL_INTERVAL_BASE_MS ?? '90000', 10) ||
      90000;
    this.jitterPercent =
      parseFloat(process.env.INGESTION_JITTER_PERCENT ?? '0.30') || 0.3;
    this.sleepStartUtc =
      parseInt(process.env.INGESTION_SLEEP_START_UTC ?? '4', 10) || 4;
    this.sleepEndUtc =
      parseInt(process.env.INGESTION_SLEEP_END_UTC ?? '10', 10) || 10;
    this.floodInitialMs =
      parseInt(process.env.INGESTION_FLOOD_INITIAL_MS ?? '5000', 10) || 5000;
    this.floodMultiplier =
      parseInt(process.env.INGESTION_FLOOD_MULTIPLIER ?? '2', 10) || 2;
    this.floodMaxMs =
      parseInt(process.env.INGESTION_FLOOD_MAX_MS ?? '3600000', 10) || 3600000;
    this.floodMaxAttempts =
      parseInt(process.env.INGESTION_FLOOD_MAX_ATTEMPTS ?? '5', 10) || 5;
  }
}
