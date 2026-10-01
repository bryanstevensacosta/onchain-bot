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

export interface TokenBalance {
  readonly contractAddress: string;
  readonly tokenBalance: string | null;
  readonly error?: string;
}

export interface TokenBalancesResponse {
  readonly address: string;
  readonly tokenBalances: ReadonlyArray<TokenBalance>;
}

export interface LogEntry {
  readonly address: string;
  readonly topics: ReadonlyArray<string>;
  readonly data: string;
  readonly blockNumber: string;
  readonly transactionHash: string;
  readonly logIndex: string;
}

export interface TransactionReceipt {
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly from: string;
  readonly to: string | null;
  readonly contractAddress: string | null;
  readonly status: string;
  readonly gasUsed: string;
  readonly effectiveGasPrice: string;
  readonly logs: ReadonlyArray<LogEntry>;
}

export interface GetLogsResponse {
  readonly logs: ReadonlyArray<LogEntry>;
}
