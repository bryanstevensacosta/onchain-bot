/**
 * LaunchpadInfo (dexter-launchpad Wave 1, Lane D).
 *
 * The ORIGIN launchpad of a token (never the current venue — origin
 * persists through graduation). Interface contract PINNED with Lane R
 * (dexter renderer): `{ id: slug, name: official brand, url: string }`
 * or `null` when no launchpad is detected. Dexter consumes it via the
 * market-data snapshot (`snapshot.launchpad`); no dexter changes here.
 */
export interface LaunchpadInfo {
  /** Slug key into the DisplayMap (`placeholderKey='launchpad'`). */
  readonly id: string;
  /** Official brand name (never a venue short form). */
  readonly name: string;
  /** Canonical per-token page, or the defined.fi fallback. No `?ref=`. */
  readonly url: string;
}
