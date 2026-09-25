import { AddressKind } from 'address/domain/address-kind';
import { AddressProbe } from 'address/domain/address-probe.port';

/**
 * Snapshot domain types (Tramo 3, todo 12, P50).
 *
 * Canonical home of the snapshot shape: one snapshot per address kind
 * (token logic is the kind=token path). `status` stays `'pending'`
 * until the todo-3 aggregators land. Moved verbatim from the former
 * `address/address-snapshot.service.ts` (no behavior change).
 */
export interface AddressSnapshotInput {
  readonly chain: string;
  readonly value: string;
  readonly kindHint?: unknown;
  readonly probe?: AddressProbe | null;
}

export interface AddressSnapshot {
  readonly chain: string;
  readonly address: string;
  readonly kind: AddressKind;
  readonly key: string;
  readonly status: 'pending';
  readonly providers: ReadonlyArray<string>;
}
