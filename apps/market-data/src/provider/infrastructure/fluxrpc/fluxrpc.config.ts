export const FLUXRPC_CONFIG = 'FLUXRPC_CONFIG';

export interface FluxRpcConfig {
  readonly apiKey: string;
  readonly rpcUrl: string;
  readonly wsUrl?: string;
}
