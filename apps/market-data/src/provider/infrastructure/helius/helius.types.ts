export interface HeliusJsonRpcError {
  readonly code: number;
  readonly message: string;
}

export interface HeliusTokenAccount {
  readonly owner?: string;
}

export interface HeliusGetTokenAccountsResponse {
  readonly result?: {
    readonly total?: number;
    readonly token_accounts?: ReadonlyArray<HeliusTokenAccount>;
  };
  readonly error?: HeliusJsonRpcError;
}

export interface HeliusDasContent {
  readonly metadata?: {
    readonly name?: string;
    readonly symbol?: string;
  };
  readonly links?: {
    readonly image?: string;
  };
}

export interface HeliusDasTokenInfo {
  readonly symbol?: string;
  readonly supply?: string | null;
  readonly decimals?: number | null;
  readonly price_info?: {
    readonly price_per_token?: number | string | null;
    readonly currency?: string;
  } | null;
}

export interface HeliusDasResponse {
  readonly result?: {
    readonly content?: HeliusDasContent;
    readonly token_info?: HeliusDasTokenInfo | null;
    readonly authorities?: ReadonlyArray<{
      readonly address: string;
      readonly scopes: ReadonlyArray<string>;
    }>;
  };
  readonly error?: HeliusJsonRpcError;
}

export interface HeliusParsedInstruction {
  readonly type?: string;
  readonly programId?: string;
  readonly info?: Record<string, unknown>;
}

export interface HeliusParsedTransaction {
  readonly signature: string;
  readonly slot: number;
  readonly blockTime: number | null;
  readonly type: string;
  readonly fee: number;
  readonly signer: string[];
  readonly instructions: ReadonlyArray<HeliusParsedInstruction>;
  readonly accounts: ReadonlyArray<{
    readonly account: string;
    readonly role: string;
  }>;
  readonly tokenTransfers?: ReadonlyArray<{
    readonly fromUserAccount: string;
    readonly toUserAccount: string;
    readonly mint: string;
    readonly tokenAmount: number;
  }>;
  readonly nativeTransfers?: ReadonlyArray<{
    readonly fromUserAccount: string;
    readonly toUserAccount: string;
    readonly amount: number;
  }>;
}

export interface HeliusAddressHistoryResponse {
  readonly result?: ReadonlyArray<HeliusParsedTransaction>;
  readonly error?: HeliusJsonRpcError;
}
