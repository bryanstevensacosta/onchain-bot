export const PUMPDEV_CONFIG = 'PUMPDEV_CONFIG';

export interface PumpDevConfig {
  readonly apiKey: string;
  readonly walletPublic: string;
  readonly walletPrivate: string;
}
