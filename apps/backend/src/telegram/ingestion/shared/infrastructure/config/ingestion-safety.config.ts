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
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as IngestionConfigJson;
  } catch {
    return null;
  }
}

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