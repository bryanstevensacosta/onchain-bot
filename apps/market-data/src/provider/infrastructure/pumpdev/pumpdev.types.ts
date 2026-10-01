export interface PumpDevTradeRequest {
  readonly publicKey: string;
  readonly action: 'buy' | 'sell';
  readonly mint: string;
  readonly amount: number;
  readonly denominatedInSol?: boolean;
  readonly slippage?: number;
}

export interface PumpDevTradeResponse {
  readonly success: boolean;
  readonly txId?: string;
  readonly error?: string;
}

export interface PumpDevCreateTokenRequest {
  readonly name: string;
  readonly symbol: string;
  readonly description?: string;
  readonly image?: string;
  readonly amount?: number;
}

export interface PumpDevCreateTokenResponse {
  readonly success: boolean;
  readonly mint?: string;
  readonly txId?: string;
  readonly error?: string;
}

export interface PumpDevBundleRequest {
  readonly mint: string;
  readonly buyers: ReadonlyArray<{
    readonly publicKey: string;
    readonly amount: number;
  }>;
}

export interface PumpDevBundleResponse {
  readonly success: boolean;
  readonly txId?: string;
  readonly error?: string;
}

export interface PumpDevTransferRequest {
  readonly to: string;
  readonly amount: number;
}

export interface PumpDevTransferResponse {
  readonly success: boolean;
  readonly txId?: string;
  readonly error?: string;
}

export interface PumpDevClaimResponse {
  readonly success: boolean;
  readonly txId?: string;
  readonly amount?: number;
  readonly error?: string;
}
