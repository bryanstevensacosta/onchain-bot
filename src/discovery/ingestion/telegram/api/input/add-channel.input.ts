/**
 * Input shape: HTTP request body to add a Telegram channel to monitor.
 * Lives in `api/input/` because it's tied to the inbound HTTP API contract.
 */
export interface AddChannelInput {
  readonly channelId: string;
  readonly username?: string;
  readonly title: string;
}
