import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface IngestionConfigJson {
  maxChannels: number;
  pollIntervalBaseMs: number;
  jitterPercent: number;
  sleepWindow: { startUtc: number; endUtc: number };
  floodProtection: {
    initialMs: number;
    multiplier: number;
    maxMs: number;
    maxAttempts: number;
  };
}

const CONFIG_PATH = join(process.cwd(), 'config', 'ingestion.config.json');

function loadConfigFromFile(): IngestionConfigJson | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(
      readFileSync(CONFIG_PATH, 'utf-8'),
    ) as IngestionConfigJson;
  } catch {
    return null;
  }
}

/**
 * @deprecated This configuration class is deprecated and will be removed in a future version.
 *
 * **Reason for deprecation:**
 * All anti-ban and safety configuration has been centralized into the ingestion service.
 * With distributed MTProto clients, each environment loading separate configs provides no
 * coordinated protection and creates confusion about which settings are actually active.
 *
 * **Migration path:**
 * - **New location:** `apps/ingestion-service/src/telegram/shared/infrastructure/config/ingestion-safety.config.ts`
 * - **Configuration file:** The centralized service loads settings from
 *   `apps/ingestion-service/config/ingestion.config.json`
 * - **Backend impact:** Backend clients do not need safety configuration when consuming via SSE.
 *   All anti-ban settings (polling intervals, jitter, sleep windows, FLOOD_WAIT protection)
 *   are managed centrally by the ingestion service.
 *
 * **What moved to ingestion service:**
 * - `maxChannels`: Maximum monitored channels (default 50) - Requirement 11.1
 * - `pollIntervalBaseMs`: Base polling interval per channel (default 90s) - Requirement 11.1
 * - `jitterPercent`: Random jitter percentage for staggered polling (default 30%) - Requirement 11.1
 * - `sleepWindow.{startUtc,endUtc}`: Sleep hours in UTC (default 04:00-08:00) - Requirement 11.3
 * - `floodProtection.*`: FLOOD_WAIT retry settings (initial delay, multiplier, max delay, max attempts) - Requirement 11.2
 *
 * **Configuration centralization benefits:**
 * - Single source of truth for all anti-ban settings across environments
 * - Consistent behavior prevents conflicting strategies that increase ban risk
 * - Easier tuning and monitoring of safety parameters
 * - Health endpoint exposes active configuration for transparency
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 11.6 for configuration file format and section 6.1 for environment variables.
 *
 * @see {@link apps/ingestion-service} Centralized safety configuration
 */
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
    const fileConfig = loadConfigFromFile();

    this.maxChannels = fileConfig?.maxChannels ?? 50;
    this.pollIntervalBaseMs = fileConfig?.pollIntervalBaseMs ?? 90000;
    this.jitterPercent = fileConfig?.jitterPercent ?? 0.3;
    this.sleepStartUtc = fileConfig?.sleepWindow?.startUtc ?? 4;
    this.sleepEndUtc = fileConfig?.sleepWindow?.endUtc ?? 8;
    this.floodInitialMs = fileConfig?.floodProtection?.initialMs ?? 5000;
    this.floodMultiplier = fileConfig?.floodProtection?.multiplier ?? 2;
    this.floodMaxMs = fileConfig?.floodProtection?.maxMs ?? 3600000;
    this.floodMaxAttempts = fileConfig?.floodProtection?.maxAttempts ?? 5;
  }
}
