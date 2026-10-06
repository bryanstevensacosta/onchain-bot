import type { LaunchpadInfo } from './launchpad-info';

/**
 * Launchpad detector port (dexter-launchpad Wave 1, Lane D).
 *
 * Market-data independence is architectural: the signature takes ONLY
 * `(chain, address)` — no pairs, no prices, no snapshot. Any failure
 * or timeout inside the detector resolves to `null`, never a throw
 * into the snapshot pipeline.
 */
export const LAUNCHPAD_DETECTOR = 'LAUNCHPAD_DETECTOR';

export interface LaunchpadDetectorPort {
  detectLaunchpad(chain: string, address: string): Promise<LaunchpadInfo | null>;
}
