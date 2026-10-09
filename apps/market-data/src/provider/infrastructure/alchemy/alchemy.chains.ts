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

/**
 * Free-B providers (dexter plan todo 30a) — Chainstack + Shyft
 * (+ Moralis-nodes probe-or-delete, closed as wontfix below).
 *
 * Provider × chain matrix (pinned):
 * - Shyft = Solana-only (`https://rpc.shyft.to/?api_key=<key>`,
 *   docs.shyft.to "Shyft RPCs"; free: RPC ~20 req/s, Index 1 req/s —
 *   our hot path uses plain RPC only, index legs are carved out).
 * - Chainstack = EVM + Solana with asterisks. Global-Node shape
 *   `https://<host>/<AUTH_KEY>` (docs.chainstack.com: base/ethereum
 *   curl examples carry the key as the trailing path segment; web3
 *   plugin: base endpoint + base key = full endpoint). Doc-PROVEN
 *   hosts: `ethereum-mainnet`, `base-mainnet`, `solana-mainnet`.
 *   `*`-rows below follow the same `<slug>-mainnet` convention
 *   (extrapolated, fail-open on first 404 — never throws): bsc*,
 *   arbitrum*, polygon*, optimism*, unichain*. NO Chainstack row for
 *   robinhood/avalanche/solana-devnet (no host evidence — tier
 *   skipped for those chains, next tier serves).
 * - dRPC = EVM (existing `DRPC_NETWORKS`; unichain/robinhood rows
 *   live-verified 2026-10-07).
 * - Moralis-nodes = WONTFIX-DOCUMENTED (no middle ground per todo):
 *   Moralis Speedy Nodes are sunset; the successor (Moralis Nodes /
 *   Grove-backed) has no verified free-tier JSON-RPC shape for our
 *   chains, and Moralis VALUE already flows via the keyed Data API
 *   (`MoralisService`, deep-index). Guessing a node URL + auth would
 *   burn quota on 401s. Owner probe recipe (do not implement without
 *   it): `POST <candidate-node-url>` + header
 *   `X-API-Key: <MORALIS_API_KEY>` + body
 *   `{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}` —
 *   expect `0x1/0x2105/0x38/0xa4e1/0x89/0xa` per chain; only on exact
 *   matches add a `moralisNodesRpcUrl(chain, key)` row + tier. Until
 *   then this file intentionally exports NO Moralis node builder
 *   (grep `moralisNodesRpcUrl` → 0 hits is the pin).
 *
 * Ceilings REALES (fail-open, never asserted live in specs):
 * Chainstack Solana 5 RPS shared; Shyft free RPC 20/s, Index 1/s
 * (index legs carved to 0/s — we never call them); holders
 * (`getTokenLargestAccounts`) excluded on both free tiers.
 *
 * QPS-math reference shape = `cold explicit-chain snapshot` (one
 * chain, address unknown to cache/history): the per-scan RPC-call
 * count below is asserted in `free-b-tiers.spec.ts`; the bare-sweep
 * multiplier (one cold scan per candidate chain) is noted there, not
 * hidden. No kill-switch: skip-if-absent (empty key ⇒ tier skipped
 * with a debug log, dRPC-copy pattern) already covers disable — no
 * new env surface beyond the two keys.
 *
 * launchpad-detector `receiptTo` EXCLUDED with reason (grep-proof):
 * that path posts `eth_getTransactionReceipt` to the keyless
 * `EVM_CHAIN_TRANSPORTS[chain].rpcUrl` (launchpad-table) gated by a
 * Blockscout creation lookup (≤1 receipt call per cold EVM detect).
 * It is NOT routed through tiered `rpcCallForChain` because (a) the
 * detector owns no ChainRpc dep and gaining one risks a module cycle
 * (`LaunchpadModule` imports only `SolanaRpcModule`), (b) receipt-by-
 * txHash has different rate semantics than chain-state reads, (c) the
 * task's MUST-NOT list freezes detector logic. Exclusion is
 * deliberate: `grep receiptTo launchpad-detector` stays keyless;
 * free-B tiers serve the EVM fast-path/readers instead.
 */
export const CHAINSTACK_EVM_HOSTS: Readonly<Record<string, string>> = {
  ethereum: 'ethereum-mainnet',
  base: 'base-mainnet',
  bsc: 'bsc-mainnet',
  arbitrum: 'arbitrum-mainnet',
  polygon: 'polygon-mainnet',
  optimism: 'optimism-mainnet',
  unichain: 'unichain-mainnet',
};

export const CHAINSTACK_SOLANA_HOST = 'solana-mainnet';

export function chainstackEvmRpcUrl(
  chain: string,
  apiKey: string,
): string | null {
  const host = CHAINSTACK_EVM_HOSTS[chain];
  if (!host) return null;
  return `https://${host}.core.chainstack.com/${apiKey}`;
}

export function chainstackSolanaRpcUrl(apiKey: string): string {
  return `https://${CHAINSTACK_SOLANA_HOST}.core.chainstack.com/${apiKey}`;
}

export function shyftSolanaRpcUrl(apiKey: string): string {
  return `https://rpc.shyft.to/?api_key=${apiKey}`;
}

/** Free-tier per-method carve-outs: index/holders legs never touch free tiers. */
export const FREEB_TIER_SKIPPED_METHODS: ReadonlyArray<string> = [
  'getTokenLargestAccounts',
  'getProgramAccounts',
];

export function isFreeBTierSkippedMethod(method: string): boolean {
  return FREEB_TIER_SKIPPED_METHODS.includes(method);
}

/**
 * QPS-math reference (asserted in `free-b-tiers.spec.ts`):
 * cold explicit-chain snapshot RPC legs that may hit free-B tiers.
 * Solana: getMultipleAccounts(1 chunked round) + getTokenSupply(1);
 * holders carved to 0. EVM (via rpcCallForChain): ≤3 chain-state
 * reads per scan (getCode + nonce + aggregate); ×2 worst case under
 * the exactly-one retry cap (todo 19b2). Bare-sweep note: a bare
 * address fans out one cold scan per candidate chain — multiply, do
 * not hide. Budgets: CHAINSTACK_SOLANA_RPS=5, SHYFT_RPC_RPS=20,
 * SHYFT_INDEX_RPS=0 (carved).
 */
export const FREEB_QPS_REFERENCE = {
  shape: 'cold explicit-chain snapshot',
  solanaRpcLegs: 2,
  evmRpcLegsPerScan: 3,
  retryMultiplierMax: 2,
  chainstackSolanaRps: 5,
  shyftRpcRps: 20,
  shyftIndexRps: 0,
} as const;

export function freeBCallsForColdExplicitChainSnapshot(
  kind: 'solana' | 'evm',
): number {
  const legs =
    kind === 'solana'
      ? FREEB_QPS_REFERENCE.solanaRpcLegs
      : FREEB_QPS_REFERENCE.evmRpcLegsPerScan;
  return legs * FREEB_QPS_REFERENCE.retryMultiplierMax;
}
