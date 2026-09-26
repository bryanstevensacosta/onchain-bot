import { Controller, Get } from '@nestjs/common';
import { DualSendParityService } from '../../application/services/dual-send-parity.service';

/**
 * Parity ledger reads (guarded by the global x-api-key guard):
 * `GET /api/telegram/parity` exposes the outcome ledger so the
 * cutover gate (`assertNoDivergence`) is observable without SSH.
 */
@Controller('api/telegram/parity')
export class TelegramParityController {
  public constructor(private readonly parity: DualSendParityService) {}

  @Get()
  public snapshot(): {
    readonly total: number;
    readonly diverged: number;
  } {
    const { total, diverged } = this.parity.snapshot();
    return { total, diverged };
  }
}
