/**
 * EVM chain transport table (Lane T, todo 22; Robinhood row todo 24).
 *
 * ONE table drives both the per-chain Alchemy endpoint map and the
 * Multicall3 support map, so a future chain plugs in by adding ONE
 * row. Keys are OUR chain ids (`STATIC_CHAINS`:
 * ethereum/solana/bsc/base/arbitrum/polygon — note `bsc`, never `bnb`).
 *
 * Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` verified
 * PRESENT via `eth_getCode` on Base/ETH/BSC/Arb/OP/Poly/Unichain on
 * 2026-10-05 AND on Robinhood on 2026-10-06 (public
 * `rpc.mainnet.chain.robinhood.com`: full runtime bytecode,
 * `eth_chainId` → `0x1237` = 4663, bytecode carries the
 * `tryAggregate` selector `bce38bd7`). Never add a row without the
 * `eth_getCode` proof (a transposed address burned us once already).
 *
 * QPS BUDGET (assumptions, numeric): Alchemy free tier ≈ 300M
 * compute units/month (~115 CU/s sustained). A batched
 * `eth_call`-via-tryAggregate costs ~26 CU flat regardless of inner
 * call count (vs ~26 CU × N for N individual calls), so one 20-call
 * aggregate saves ~494 CU. `eth_getCode`/`eth_getTransactionCount`
 * cost ~20 CU each. Existence-check-first (2 × 20 CU) gates the
 * aggregate: a dead address costs 40 CU, never a full fan-out.
 * Quota owner: whoever holds `ALCHEMY_API_KEY` (see `.env.example`);
 *   429/over-quota collapses to null here; retry/backoff lives in the
 *   per-fetcher single-retry wrapper (todo 19b2), not in this transport.
 */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export interface EvmChainTransport {
  readonly alchemySubdomain: string;
  readonly chainId: number;
  readonly multicall3: string | null;
}

export const EVM_CHAIN_TRANSPORTS: Readonly<Record<string, EvmChainTransport>> =
  {
    ethereum: {
      alchemySubdomain: 'eth-mainnet',
      chainId: 1,
      multicall3: MULTICALL3_ADDRESS,
    },
    base: {
      alchemySubdomain: 'base-mainnet',
      chainId: 8453,
      multicall3: MULTICALL3_ADDRESS,
    },
    bsc: {
      alchemySubdomain: 'bnb-mainnet',
      chainId: 56,
      multicall3: MULTICALL3_ADDRESS,
    },
    arbitrum: {
      alchemySubdomain: 'arb-mainnet',
      chainId: 42161,
      multicall3: MULTICALL3_ADDRESS,
    },
    polygon: {
      alchemySubdomain: 'polygon-mainnet',
      chainId: 137,
      multicall3: MULTICALL3_ADDRESS,
    },
    optimism: {
      alchemySubdomain: 'opt-mainnet',
      chainId: 10,
      multicall3: MULTICALL3_ADDRESS,
    },
    unichain: {
      alchemySubdomain: 'unichain-mainnet',
      chainId: 130,
      multicall3: MULTICALL3_ADDRESS,
    },
    robinhood: {
      alchemySubdomain: 'robinhood-mainnet',
      chainId: 4663,
      multicall3: MULTICALL3_ADDRESS,
    },
  };

export function isChainSupported(chain: string): boolean {
  return Object.hasOwn(EVM_CHAIN_TRANSPORTS, chain);
}

export function chainRpcUrl(chain: string, apiKey: string): string | null {
  const transport = EVM_CHAIN_TRANSPORTS[chain];
  if (!transport) return null;
  return `https://${transport.alchemySubdomain}.g.alchemy.com/v2/${apiKey}`;
}

/**
 * Fallback-tier timeout (todo 24): every non-Alchemy tier attempt
 * carries its OWN deadline — a slow tier never hangs the call, the
 * next tier is tried instead. Alchemy keeps its historical 8s.
 */
export const EVM_RPC_TIER_TIMEOUT_MS = 5_000;

/**
 * Our chain id -> dRPC network slug (todo 24, tier 2).
 *
 * Endpoint shape per drpc.org docs:
 * `https://lb.drpc.live/<network>/<DRPC_API_KEY>`. Slugs here are
 * the dashboard names — a chain WITHOUT a row is NOT covered by
 * dRPC (tier skipped silently, never guessed). Unichain (`unichain`,
 * `eth_chainId` → `0x82` = 130) and Robinhood (`robinhood`,
 * `eth_chainId` → `0x1237` = 4663) verified live 2026-10-07 via
 * public `https://<slug>.drpc.org`. Key via env `DRPC_API_KEY`
 * (owner creates it; absent key skips the whole tier with a debug log).
 */
export const DRPC_NETWORKS: Readonly<Record<string, string>> = {
  ethereum: 'ethereum',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  optimism: 'optimism',
  unichain: 'unichain',
  robinhood: 'robinhood',
};

export function drpcRpcUrl(chain: string, apiKey: string): string | null {
  const network = DRPC_NETWORKS[chain];
  if (!network) return null;
  return `https://lb.drpc.live/${network}/${apiKey}`;
}

/**
 * Stable raw-call contract for Lane S/E readers (Lane T, todo 22).
 *
 * FROZEN: `chain` is OUR chain id (`bsc`, never `bnb`); unknown
 * chains resolve `null` (never throw). `getCode` empty/0x ⇒ EOA;
 * `getTransactionCount` returns the hex nonce (EOA-vs-dead signal);
 * `ethCall` returns raw hex return-data (reverts ⇒ `null`).
 */
export interface ChainRpc {
  getCode(chain: string, address: string): Promise<string | null>;
  getTransactionCount(chain: string, address: string): Promise<string | null>;
  ethCall(
    chain: string,
    to: string,
    data: string,
    block?: string,
  ): Promise<string | null>;
}
