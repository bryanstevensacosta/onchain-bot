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

export interface AccountInfoResult {
  readonly context?: { readonly slot: number };
  readonly value?: {
    readonly data: readonly [string, string];
    readonly executable: boolean;
    readonly lamports: number;
    readonly owner: string;
    readonly rentEpoch: number;
    readonly space?: number;
  } | null;
}
