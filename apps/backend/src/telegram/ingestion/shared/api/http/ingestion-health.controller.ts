import { Controller, Get } from '@nestjs/common';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';

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

// Safety defaults previously owned by the deleted backend IngestionSafetyConfig.
// Anti-ban tuning now lives in ingestion-telegram; these static values keep the
// DTO shape stable for existing consumers (desvinculacion T6, anticipada en T5
// para borrar el bloque MTProto sin romper el build).
const LEGACY_SAFETY_DEFAULTS = {
  maxSafeChannels: 50,
  floodWaitCount24h: 0,
  floodWaitMaxSeconds24h: 0,
  isSleeping: false,
  sleepWindowStart: 4,
  sleepWindowEnd: 8,
  pollIntervalMs: 90000,
} as const;

@Controller('ingestion')
export class IngestionHealthController {
  private lastPollAt: Date | null = null;

  constructor(private readonly kolRepo: KolRepository) {}

  @Get('health')
  public async getHealth(): Promise<IngestionHealthDto> {
    const kols = await this.kolRepo.findAll();
    const activeChannels = kols.filter((k) => k.isActive).length;
    const totalSeededChannels = kols.length;

    return {
      activeChannels,
      totalSeededChannels,
      ...LEGACY_SAFETY_DEFAULTS,
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
    };
  }

  public markPoll(): void {
    this.lastPollAt = new Date();
  }
}
