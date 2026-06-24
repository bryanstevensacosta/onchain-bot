/**
 * Input shape: HTTP request body to start ingesting from a set of KOLs.
 * Lives in `api/input/` because it's tied to the inbound HTTP API contract.
 *
 * Fase 4 of the kol-refactor plan: renamed from `StartListeningInput`.
 */
export interface StartKolIngestionInput {
  readonly kolIds: ReadonlyArray<string>;
}
