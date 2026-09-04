/**
 * BackendRegistration Entity
 *
 * Represents a registered backend instance with its source whitelist.
 * Used to compute the channel union for MTProto subscriptions.
 *
 * Per Requirement 1.2: Store Backend identifier and Source_Whitelist in memory
 * Per Requirement 2.1: Track backend connection state for backfill
 */
export class BackendRegistration {
  private readonly _backendId: string;
  private _sourceWhitelist: ReadonlySet<string>;
  private readonly _registeredAt: number;
  private _lastSeenTimestamp: number;
  private readonly _apiVersion: string;

  /**
   * Create a new backend registration
   *
   * @param backendId - Unique identifier for the backend (e.g., "production", "staging")
   * @param sourceWhitelist - Array of Telegram channel/user IDs this backend wants to receive
   * @param apiVersion - API version for future compatibility (default: "v1")
   * @throws Error if backendId is empty
   */
  constructor(
    backendId: string,
    sourceWhitelist: string[],
    apiVersion: string = 'v1',
  ) {
    if (!backendId || backendId.trim().length === 0) {
      throw new Error('BackendRegistration: backendId must be non-empty');
    }

    this._backendId = backendId;
    this._sourceWhitelist = new Set(sourceWhitelist);
    this._registeredAt = Date.now();
    this._lastSeenTimestamp = Date.now();
    this._apiVersion = apiVersion;
  }

  /**
   * Get the backend identifier
   */
  get backendId(): string {
    return this._backendId;
  }

  /**
   * Get the source whitelist as a readonly Set
   */
  get sourceWhitelist(): ReadonlySet<string> {
    return this._sourceWhitelist;
  }

  /**
   * Get the registration timestamp
   */
  get registeredAt(): number {
    return this._registeredAt;
  }

  /**
   * Get the last seen timestamp
   */
  get lastSeenTimestamp(): number {
    return this._lastSeenTimestamp;
  }

  /**
   * Get the API version
   */
  get apiVersion(): string {
    return this._apiVersion;
  }

  /**
   * Update the source whitelist
   *
   * @param newWhitelist - New array of channel IDs
   */
  updateWhitelist(newWhitelist: string[]): void {
    this._sourceWhitelist = new Set(newWhitelist);
    this._lastSeenTimestamp = Date.now();
  }

  /**
   * Record a disconnection event
   */
  recordDisconnect(): void {
    this._lastSeenTimestamp = Date.now();
  }

  /**
   * Check if a channel ID is in the whitelist
   *
   * @param channelId - Telegram channel/user ID
   * @returns true if channelId is in the whitelist
   */
  hasChannel(channelId: string): boolean {
    return this._sourceWhitelist.has(channelId);
  }

  /**
   * Get the whitelist as an array
   *
   * @returns Array of channel IDs
   */
  getWhitelistArray(): string[] {
    return Array.from(this._sourceWhitelist);
  }
}
