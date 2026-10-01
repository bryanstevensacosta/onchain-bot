/**
 * Tier-1 config for threads-publisher (flat env, no namespaces).
 *
 * Ports: dev :4100 / staging host :4101 / prod host :4102.
 * DBs: threads_publisher_db[_staging] (C-DB-01: own logical DB).
 * Gateway: BOTS_GATEWAY_URL dev :4070 / staging :4071 / prod :4072.
 */
export interface ThreadsPublisherConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly synchronize: boolean;
}

export function buildThreadsPublisherConfig(
  env: NodeJS.ProcessEnv = process.env,
): ThreadsPublisherConfig {
  const port = Number(env.THREADS_PUBLISHER_PORT ?? 4100);
  return {
    port: Number.isFinite(port) ? port : 4100,
    databaseUrl:
      env.DATABASE_URL ??
      'postgres://onchain_bot:onchain_bot@localhost:5432/threads_publisher_db',
    synchronize: (env.DATABASE_SYNCHRONIZE ?? 'true') !== 'false',
  };
}

export function validateThreadsPublisherConfig(
  env: NodeJS.ProcessEnv = process.env,
): { warnings: string[] } {
  const warnings: string[] = [];
  if (!env.DATABASE_URL) {
    warnings.push('DATABASE_URL empty, using dev default');
  }
  if (
    (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') &&
    (env.DATABASE_SYNCHRONIZE ?? 'false') !== 'false'
  ) {
    throw new Error('DATABASE_SYNCHRONIZE must be false in staging/production');
  }
  return { warnings };
}
