import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ApiKeyService } from './application/api-key.service';
import { ApiKeyRateLimiter } from './application/api-key-rate-limiter';
import { ApiKeysController } from './api/http/api-keys.controller';

/**
 * AuthModule (ai-ml, todo 0): scoped API-key store (HMAC hashes only) +
 * per-key rate limiter + admin key management (`/api/auth/keys`,
 * admin scope). Fail-closed on staging/prod without ENCRYPTION_KEY:
 * the key store cannot hash without its pepper, so boot throws a
 * clear error instead of silently running keyless.
 */
@Global()
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeyService, ApiKeyRateLimiter],
  exports: [ApiKeyService, ApiKeyRateLimiter],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  public constructor(private readonly config: ConfigService) {}

  public onModuleInit(): void {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const pepper = this.config.get<string>('ENCRYPTION_KEY', '').trim();
    if (!pepper && (nodeEnv === 'production' || nodeEnv === 'staging')) {
      throw new Error(
        'AI_ML misconfigured: ENCRYPTION_KEY is required but empty (distinct per env — generate with `openssl rand -hex 32`)',
      );
    }
    if (!pepper) {
      this.logger.warn('ENCRYPTION_KEY is empty — keyless dev mode (fail-open). Never deploy like this.');
    }
  }
}
