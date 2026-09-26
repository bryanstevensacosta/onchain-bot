import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { DexterModule } from './dexter/dexter.module';

/**
 * AppModule - Root module for dexter-onchain-bot (Tramo 3, todo 9, P13).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + DexterModule (lookup bot fed
 * by market-data HTTP). Lookup-only: no publishing, no scoring, no
 * tracking modules anywhere in this graph.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    DexterModule,
  ],
})
export class AppModule {}
