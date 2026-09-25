import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';
import { TokenModule } from './token/token.module';
import { ChainModule } from './chain/chain.module';
import { ProviderModule } from './provider/provider.module';
import { CacheModule } from './cache/cache.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';

/**
 * AppModule - Root module for market-data skeleton (Tramo 3, todo 1).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + SharedModule (global) +
 * 5 stub feature modules (token, chain, provider, cache, rate-limiter).
 * All feature modules are EMPTY stubs: business logic lands in todos 2-3.
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
    ChainModule,
    ProviderModule,
    CacheModule,
    RateLimiterModule,
  ],
})
export class AppModule {}
