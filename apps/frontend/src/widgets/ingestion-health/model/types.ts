export interface IngestionHealth {
  activeChannels: number;
  totalSeededChannels: number;
  maxSafeChannels: number;
  floodWaitCount24h: number;
  floodWaitMaxSeconds24h: number;
  isSleeping: boolean;
  sleepWindowStart: number;
  sleepWindowEnd: number;
  pollIntervalMs: number;
  lastPollAt: string | null;
}
