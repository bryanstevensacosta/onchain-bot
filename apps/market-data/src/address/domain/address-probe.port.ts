/**
 * AddressProbe port (Tramo 3, todo 12, P50 — address domain).
 *
 * Optional on-chain evidence refining format-only kind detection.
 * `isContract` is null when the prober has no RPC evidence (v1
 * format-only probers never claim contract state). Moved verbatim
 * from the former `address/address-kind-detector.service.ts`.
 */
export interface AddressProbe {
  readonly responded: boolean;
  readonly isContract: boolean | null;
}
