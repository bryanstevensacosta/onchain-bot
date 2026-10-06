export interface JsonRpcRequest<TParams = unknown[]> {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: TParams;
}

export interface JsonRpcResponse<TResult = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result?: TResult;
  readonly error?: JsonRpcError;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
}

export interface SolanaBalanceResponse {
  readonly context: { readonly slot: number };
  readonly value: number;
}

/**
 * `getAccountInfo` with `base64` encoding (Lane T, todo 22): raw
 * account bytes for pool-struct decode. `jsonParsed` is unusable for
 * structs (it only parses known program layouts); base64 carries the
 * bytes Lane S readers decode by hand.
 */
export interface SolanaBase64AccountValue {
  readonly data: readonly [string, string];
  readonly executable: boolean;
  readonly lamports: number;
  readonly owner: string;
  readonly rentEpoch: number;
  readonly space?: number;
}

export interface SolanaBase64AccountResponse {
  readonly context: { readonly slot: number };
  readonly value: SolanaBase64AccountValue | null;
}

export interface SolanaTokenAccount {
  readonly account: {
    readonly data: {
      readonly parsed: {
        readonly info: {
          readonly mint: string;
          readonly tokenAmount: { readonly uiAmount: number };
        };
      };
    };
    readonly owner: string;
  };
  readonly pubkey: string;
}

export interface SolanaTransactionResponse {
  readonly slot: number;
  readonly blockTime: number | null;
  readonly meta: {
    readonly err: unknown;
    readonly fee: number;
    readonly postBalances: ReadonlyArray<number>;
    readonly preBalances: ReadonlyArray<number>;
  } | null;
  readonly transaction: { readonly signatures: ReadonlyArray<string> };
}
