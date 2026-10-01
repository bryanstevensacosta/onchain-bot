import { Module } from '@nestjs/common';
import { IngressController } from './api/http/ingress.controller';
import { SubscriptionRegistryService } from './application/subscription-registry.service';
import { IngressModeService } from './application/ingress-mode.service';
import { DeadLetterStore } from './application/dead-letter.store';
import { UpdateFanoutService } from './application/update-fanout.service';
import { UpdatePollerService } from './application/update-poller.service';
import { VaultModule } from '../vault/vault.module';

function parseBackoffMs(raw: string | undefined): number[] {
  if (!raw || !raw.trim()) return [200, 1000, 5000];
  const parts = raw
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parts.length > 0 ? parts : [200, 1000, 5000];
}

@Module({
  imports: [VaultModule],
  controllers: [IngressController],
  providers: [
    SubscriptionRegistryService,
    IngressModeService,
    DeadLetterStore,
    UpdateFanoutService,
    UpdatePollerService,
    {
      provide: 'INGRESS_FANOUT_OPTS',
      useFactory: () => ({
        maxAttempts:
          Number(process.env.BOTS_GATEWAY_FANOUT_MAX_ATTEMPTS ?? 4) || 4,
        backoffMs: parseBackoffMs(process.env.BOTS_GATEWAY_FANOUT_BACKOFF_MS),
      }),
    },
  ],
  exports: [
    SubscriptionRegistryService,
    IngressModeService,
    DeadLetterStore,
    UpdateFanoutService,
  ],
})
export class IngressModule {}
