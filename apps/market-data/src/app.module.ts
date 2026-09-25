import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';
import { ApiKeyGuard } from './shared/infrastructure/guards/api-key.guard';
import { TokenModule } from './token/token.module';
import { AddressModule } from './address/address.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { ProvidersModule } from './provider/infrastructure/providers.module';
import { ChainModule } from './chain/chain.module';
import { ProviderModule } from './provider/provider.module';
import { CacheModule } from './cache/cache.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';
import { GatewayModule } from './gateway/gateway.module';

/**
 * AppModule - Root module for market-data (Tramo 3, todo 2).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + SharedModule (global) +
 * TokenModule (deprecated P45 alias of AddressModule) + AddressModule
 * (universal model, P45) + Chain/Provider/Cache/RateLimiter
 * (ports, todo 2) + GatewayModule (P43: the ONLY feature controllers).
 * Inbound x-api-key enforced globally at the edge (fail-open dev).
 * Variante A: single-BC monorepo app (no Nx, no libs/* — see AGENTS.md G-16).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    SharedModule,
    TokenModule,
    AddressModule,
    SnapshotModule,
    ProvidersModule,
    ChainModule,
    ProviderModule,
    CacheModule,
    RateLimiterModule,
    GatewayModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
