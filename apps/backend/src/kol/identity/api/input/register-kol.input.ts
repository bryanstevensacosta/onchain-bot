/**
 * Input shape: HTTP request body to register a Telegram KOL to monitor.
 * Lives in `api/input/` because it's tied to the inbound HTTP API contract.
 */
export interface RegisterKolInput {
  readonly kolId: string;
  readonly handle?: string;
  readonly title?: string;
}
