/**
 * Input shape: HTTP request body to start listening on a set of channels.
 * Lives in `api/input/` because it's tied to the inbound HTTP API contract.
 */
export interface StartListeningInput {
  readonly channelIds: ReadonlyArray<string>;
}
