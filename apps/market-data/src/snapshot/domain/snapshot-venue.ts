/**
 * Snapshot venue domain type (dexter venue-line, plan todo 14).
 *
 * The DEX venue of the best-liquidity pair: `{ dexId, labels }` or
 * `null` when dexscreener has no pair for the token. Coexists with
 * `snapshot.launchpad` without touching it — `dexId` (e.g.
 * `meteoradbc`) and `launchpad.id` (e.g. `meteora-dbc`) live in
 * separate tables and are never mixed (asserted in
 * `address-snapshot-venue.spec.ts`). Resolved live per call, never
 * persisted to history — same lifecycle as `launchpad`.
 */
export interface SnapshotVenue {
  readonly dexId: string;
  readonly labels: ReadonlyArray<string>;
}

export function toVenueOrNull(raw: unknown): SnapshotVenue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const { dexId, labels } = candidate;
  if (typeof dexId !== 'string' || dexId.trim() === '') return null;
  if (!Array.isArray(labels)) return null;
  const clean = labels.filter(
    (entry): entry is string => typeof entry === 'string',
  );
  return { dexId: dexId.trim(), labels: clean };
}
