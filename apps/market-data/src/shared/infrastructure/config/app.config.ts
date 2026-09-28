import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  host: string;
  alchemy: { apiKey: string };
  birdeye: { apiKey: string };
  coingecko: { apiKey: string };
  coinmarketcap: { apiKey: string };
  moralis: { apiKey: string };
  mobula: { apiKey: string };
  helius: {
    apiKey: string;
    mainnet: { rpcUrl: string };
    devnet?: { rpcUrl: string };
  };
  fluxrpc: { apiKey: string; rpcUrl: string; wsUrl?: string };
  pumpdev: { apiKey: string; walletPublic: string; walletPrivate: string };
  solanaRpc: { primaryRpcUrl?: string; fallbackRpcUrl: string };
}

export function buildAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return {
    port: parseInt(env.MARKET_DATA_PORT ?? '4000', 10),
    nodeEnv: env.NODE_ENV ?? 'development',
    host: env.MARKET_DATA_HOST ?? '127.0.0.1',
    alchemy: {
      apiKey: env.ALCHEMY_API_KEY ?? '',
    },
    birdeye: {
      apiKey: env.BIRDEYE_API_KEY ?? '',
    },
    coingecko: {
      apiKey: env.COINGECKO_API_KEY ?? '',
    },
    coinmarketcap: {
      apiKey: env.COINMARKETCAP_API_KEY ?? '',
    },
    moralis: {
      apiKey: env.MORALIS_API_KEY ?? '',
    },
    mobula: {
      apiKey: env.MOBULA_API_KEY ?? '',
    },
    helius: {
      apiKey: env.HELIUS_API_KEY ?? '',
      mainnet: {
        rpcUrl: env.HELIUS_RPC_URL_MAINNET ?? '',
      },
      devnet: {
        rpcUrl: env.HELIUS_RPC_URL_DEVNET ?? '',
      },
    },
    fluxrpc: {
      apiKey: env.FLUXRPC_API_KEY ?? '',
      rpcUrl: env.FLUXRPC_RPC ?? '',
      wsUrl: env.FLUXRPC_WS,
    },
    pumpdev: {
      apiKey: env.PUMPDEV_API_KEY ?? '',
      walletPublic: env.PUMPDEV_WALLET_PUBLIC ?? '',
      walletPrivate: env.PUMPDEV_WALLET_PRIVATE ?? '',
    },
    solanaRpc: {
      primaryRpcUrl: env.HELIUS_RPC_URL_MAINNET || undefined,
      fallbackRpcUrl: 'https://api.mainnet.solana.com',
    },
  };
}

export const appConfig = registerAs('app', (): AppConfig => buildAppConfig());
