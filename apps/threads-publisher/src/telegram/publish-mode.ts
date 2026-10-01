export type ThreadsPublishMode = 'direct' | 'dual' | 'gateway';

/**
 * Resolves THREADS_PUBLISH_MODE (default dual). Unknown -> dual.
 */
export function resolveThreadsPublishMode(
  env: NodeJS.ProcessEnv = process.env,
): ThreadsPublishMode {
  const raw = (env.THREADS_PUBLISH_MODE ?? 'dual').trim().toLowerCase();
  if (raw === 'direct' || raw === 'gateway') {
    return raw;
  }
  return 'dual';
}
