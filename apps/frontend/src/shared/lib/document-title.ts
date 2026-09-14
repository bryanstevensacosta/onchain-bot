const TITLES: Record<string, string> = {
  production: 'Prod Onchain Bot',
  staging: 'Stage Onchain Bot',
  development: 'Dev Onchain Bot',
};

/**
 * Sets the browser tab title from VITE_APP_ENV so the three deployed
 * environments are distinguishable at a glance. Runs once at startup
 * (see app/entry.tsx); unknown envs fall back to the dev title.
 */
export function applyEnvironmentTitle(): void {
  const env = import.meta.env.VITE_APP_ENV ?? 'development';
  document.title = TITLES[env] ?? TITLES.development;
}
