import { Injectable } from '@nestjs/common';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';

@Injectable()
export class SleepWindowService {
  private readonly baseStartUtc: number;
  private readonly baseEndUtc: number;
  private rotationMinutes = 0;
  private lastRotationDate = '';

  constructor(private readonly config: IngestionSafetyConfig) {
    this.baseStartUtc = config.sleepStartUtc;
    this.baseEndUtc = config.sleepEndUtc;
  }

  public isAsleep(): boolean {
    this.ensureRotation();
    const now = new Date();
    const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMin = this.baseStartUtc * 60 + this.rotationMinutes;
    const endMin = this.baseEndUtc * 60 + this.rotationMinutes;
    if (startMin <= endMin)
      return totalMinutes >= startMin && totalMinutes < endMin;
    return totalMinutes >= startMin || totalMinutes < endMin;
  }

  public getNextWakeTime(): Date | null {
    if (!this.isAsleep()) return null;
    const now = new Date();
    const endMin = this.baseEndUtc * 60 + this.rotationMinutes;
    const wake = new Date(now);
    wake.setUTCHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (wake <= now) wake.setUTCDate(wake.getUTCDate() + 1);
    return wake;
  }

  public rotateWindow(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today === this.lastRotationDate) return;
    this.lastRotationDate = today;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        86_400_000,
    );
    this.rotationMinutes = (dayOfYear % 61) - 30;
  }

  private ensureRotation(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastRotationDate) this.rotateWindow();
  }
}
