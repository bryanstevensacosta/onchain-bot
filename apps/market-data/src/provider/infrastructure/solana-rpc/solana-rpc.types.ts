export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
}

export interface JsonRpcResponse<T> {
  readonly jsonrpc: string;
  readonly id: string | number;
  readonly result?: T;
  readonly error?: JsonRpcError;
}

export interface TokenAccountEntry {
  readonly address: string;
  readonly amount: string;
  readonly decimals: number;
  readonly uiAmount: number | null;
  readonly uiAmountString: string;
}

export interface GetTokenLargestAccountsResult {
  readonly context?: { readonly slot: number };
  readonly value?: ReadonlyArray<TokenAccountEntry>;
}

export interface GetTokenSupplyResult {
  readonly context?: { readonly slot: number };
  readonly value?: {
    readonly amount: string;
    readonly decimals: number;
    readonly uiAmount: number | null;
    readonly uiAmountString: string;
  };
}

export interface SolanaAccountInfoValue {
  readonly data: readonly [string, string];
  readonly executable: boolean;
  readonly lamports: number;
  readonly owner: string;
  readonly rentEpoch: number;
  readonly space?: number;
}

export interface AccountInfoResult {
  readonly context?: { readonly slot: number };
  readonly value?: SolanaAccountInfoValue | null;
}

/**
 * `getMultipleAccounts` result: `value` keeps one entry per requested
 * address IN ORDER — a missing account is an explicit `null` entry
 * (per-account null tolerance), never a shortened array.
 */
export interface GetMultipleAccountsResult {
  readonly context?: { readonly slot: number };
  readonly value?: ReadonlyArray<SolanaAccountInfoValue | null>;
}

/**
 * Stable batch-read contract for Lane S/E pool readers (Lane T, todo 22).
 *
 * FROZEN: `getMultiple` resolves one entry per requested address IN
 * ORDER; unknown accounts are explicit `null` entries. Transport
 * failures NEVER throw and NEVER fail the whole call — a failed chunk
 * resolves to `null`s for its slice. Empty input resolves `[]` with
 * zero RPC traffic.
 */
export interface BatchAccountsClient {
  getMultiple(
    addresses: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SolanaAccountInfoValue | null>>;
}
