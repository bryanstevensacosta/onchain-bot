import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ClientRegistryService } from './application/client-registry.service';
import { HmacService } from './application/hmac.service';
import { NonceStore } from './application/nonce-store';
import { ServiceAuthGuard } from './api/http/service-auth.guard';

@Module({
  providers: [
    ClientRegistryService,
    HmacService,
    NonceStore,
    {
      provide: 'AUTH_CLOCK_SKEW_SEC',
      useFactory: (config: ConfigService) =>
        config.get<number>('app.clockSkewSec', 300) ?? 300,
      inject: [ConfigService],
    },
    { provide: APP_GUARD, useClass: ServiceAuthGuard },
  ],
  exports: [ClientRegistryService, HmacService],
})
export class AuthModule {}
