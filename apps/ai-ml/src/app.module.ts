import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';
import { ApiKeyGuard } from './shared/infrastructure/guards/api-key.guard';
import { AuthModule } from './auth/auth.module';
import { LlmModule } from './llm/llm.module';

/**
 * AppModule - Root module for ai-ml (todo 0).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + SharedModule (global audit)
 * + AuthModule (scoped keys, fail-closed without ENCRYPTION_KEY on
 * staging/prod) + LlmModule (multi-provider gateway + 3-flag mirror
 * + usage audit). Inbound x-api-key enforced globally at the edge
 * (fail-open dev).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    SharedModule,
    AuthModule,
    LlmModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
