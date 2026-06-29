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
