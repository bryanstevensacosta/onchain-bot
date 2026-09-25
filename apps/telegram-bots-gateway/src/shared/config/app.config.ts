import { DomainError, ErrorCode } from '../kernel/domain-error';

export interface BotsGatewayConfig {
  readonly port: number;
  readonly encryptionKey: string;
  readonly databaseUrl: string;
  readonly databaseSynchronize: boolean;
  readonly avatarDir: string;
}

/**
 * Tier-1 validation: the gateway must NOT boot without ENCRYPTION_KEY
 * (distinct per env) + DATABASE_URL. Empty key -> clear throw, no listen.
 */
export function buildAppConfig(
  env: Record<string, string | undefined> = process.env,
): BotsGatewayConfig {
  const encryptionKey = (env.ENCRYPTION_KEY ?? '').trim();
  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY is required but empty (generate `openssl rand -hex 32`, DISTINCT per env). Refusing to boot.',
    );
  }
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required but empty (own logical DB: onchain_bot_bots[_staging]). Refusing to boot.',
    );
  }
  const port = Number(env.BOTS_GATEWAY_PORT ?? 4070) || 4070;
  return {
    port,
    encryptionKey,
    databaseUrl,
    databaseSynchronize: (env.DATABASE_SYNCHRONIZE ?? 'true') === 'true',
    avatarDir: (env.AVATAR_DIR ?? 'uploads/avatars').trim(),
  };
}

export function assertConfigValid(env?: Record<string, string | undefined>) {
  try {
    return buildAppConfig(env);
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : (err as Error).message;
    throw new Error(`[bots-gateway] invalid config: ${message}`);
  }
}

export { DomainError, ErrorCode };
