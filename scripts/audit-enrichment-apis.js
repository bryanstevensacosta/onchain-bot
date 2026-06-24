#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', 'apps', 'backend', '.env') });
const axios = require('axios');

const TOKENS = {
  USDC_ETH: { chain: 'ethereum', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', label: 'USDC (Ethereum, established)' },
  PEPE: { chain: 'ethereum', address: '0x6982508145454ce325ddbe47a25d4ec3d2311933', label: 'PEPE (Ethereum, popular meme)' },
  USDC_SOL: { chain: 'solana', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', label: 'USDC (Solana, established)' },
  BONK: { chain: 'solana', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', label: 'BONK (Solana, popular meme)' },
  CAI_PUMP: { chain: 'solana', address: 'Aq4UgKQRvYRhpjdHPmGs4f6w8MaEJA1HzmMDAM4epump', label: 'Cai (Solana pump.fun, freshly launched)' },
};

const KEYS = {
  alchemy: process.env.ALCHEMY_API_KEY,
  birdeye: process.env.BIRDEYE_API_KEY,
  helius: process.env.HELIUS_API_KEY,
  heliusRpc: process.env.HELIUS_RPC_URL_MAINNET,
  mobula: process.env.MOBULA_API_KEY,
  moralis: process.env.MORALIS_API_KEY,
  fluxRpc: process.env.FLUXRPC_RPC,
  coingecko: process.env.COINGECKO_API_KEY,
};

const HELIUS_DAS = 'https://mainnet.helius-rpc.com/?api-key=' + (process.env.HELIUS_API_KEY || '');
const TIMEOUT = 8000;

function ok(s) { return console.log(`\x1b[32m✓\x1b[0m ${s}`); }
function err(s) { return console.log(`\x1b[31m✗\x1b[0m ${s}`); }
function dim(s) { return console.log(`\x1b[2m  ${s}\x1b[0m`); }
function header(s) { return console.log(`\n\x1b[1m\x1b[36m=== ${s} ===\x1b[0m`); }

const FIELDS = ['priceUsd', 'liquidityUsd', 'marketCapUsd', 'fdvUsd', 'volume24hUsd',
  'priceChange24h', 'holders', 'top10HolderPercent', 'lockedLiquidityPercent',
  'burnedPercent', 'totalSupply', 'top10HolderPct', 'insidersPct', 'bundlersPct', 'devPct', 'bondingPct'];

function summarizeFields(obj) {
  const present = [];
  const missing = [];
  for (const f of FIELDS) {
    const v = obj[f];
    if (v !== null && v !== undefined) {
      const val = typeof v === 'number' ? (Math.abs(v) > 100 ? v.toFixed(2) : v) : (typeof v === 'string' ? v.slice(0, 20) : '?');
      present.push(`${f}=${val}`);
    } else {
      missing.push(f);
    }
  }
  return { present, missing };
}

async function safeRequest(fn) {
  try { return await fn(); }
  catch (e) {
    const status = e.response?.status;
    const data = e.response?.data;
    const msg = (data && typeof data === 'object' ? JSON.stringify(data).slice(0, 120) : e.message).slice(0, 120);
    return { __error: true, status, msg };
  }
}

async function testDexScreener(token) {
  return safeRequest(async () => {
    const { data } = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`, { timeout: TIMEOUT });
    const pairs = data.pairs || [];
    if (pairs.length === 0) return { __error: true, msg: 'no pairs' };
    const best = pairs.reduce((a, p) => (p.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? p : a, pairs[0]);
    return {
      priceUsd: best.priceUsd ? parseFloat(best.priceUsd) : null,
      liquidityUsd: best.liquidity?.usd ?? null,
      marketCapUsd: best.marketCap ?? null,
      fdvUsd: best.fdv ?? null,
      volume24hUsd: best.volume?.h24 ?? null,
      priceChange24h: best.priceChange?.h24 ?? null,
    };
  });
}

async function testGeckoTerminal(token) {
  const slugMap = { ethereum: 'eth', solana: 'solana', bsc: 'bsc', base: 'base', arbitrum: 'arbitrum', polygon: 'polygon_pos' };
  const slug = slugMap[token.chain];
  if (!slug) return { __error: true, msg: `no slug for ${token.chain}` };
  return safeRequest(async () => {
    const { data } = await axios.get(`https://api.geckoterminal.com/api/v2/networks/${slug}/tokens/${token.address}/info`, { timeout: TIMEOUT });
    const a = data.data.attributes;
    return {
      priceUsd: a.price_usd ? parseFloat(a.price_usd) : null,
      marketCapUsd: a.market_cap_usd ? parseFloat(a.market_cap_usd) : null,
      fdvUsd: a.fdv_usd ? parseFloat(a.fdv_usd) : null,
      volume24hUsd: a.volume_usd?.h24 ? parseFloat(a.volume_usd.h24) : null,
      priceChange24h: a.price_change_percentage?.h24 ? parseFloat(a.price_change_percentage.h24) : null,
      holders: a.holders?.count ?? null,
      top10HolderPercent: a.top_10_percent_holders ? parseFloat(a.top_10_percent_holders) : null,
    };
  });
}

async function testBirdeye(token) {
  if (!KEYS.birdeye) return { __error: true, msg: 'no key' };
  if (token.chain !== 'solana') return { __skipped: true };
  return safeRequest(async () => {
    const { data } = await axios.get('https://public-api.birdeye.so/defi/token_overview', {
      params: { address: token.address },
      headers: { 'X-API-KEY': KEYS.birdeye, 'x-chain': 'solana' },
      timeout: TIMEOUT,
    });
    if (!data.success || !data.data) return { __error: true, msg: 'no data' };
    const d = data.data;
    return {
      priceUsd: d.price, liquidityUsd: d.liquidity, marketCapUsd: d.mc,
      fdvUsd: d.fdv, volume24hUsd: d.volume24h, priceChange24h: d.priceChange24h,
      totalSupply: d.totalSupply,
    };
  });
}

async function testHeliusDAS(token) {
  if (!KEYS.helius) return { __error: true, msg: 'no key' };
  if (token.chain !== 'solana') return { __skipped: true };
  return safeRequest(async () => {
    const { data } = await axios.post(HELIUS_DAS, {
      jsonrpc: '2.0', id: 'test', method: 'getAsset',
      params: { id: token.address, displayOptions: { showFungible: true } },
    }, { timeout: TIMEOUT });
    if (data.error) return { __error: true, msg: data.error.message };
    const r = data.result || {};
    const ti = r.token_info || {};
    return {
      priceUsd: ti.price_info?.price_per_token ? parseFloat(ti.price_info.price_per_token) : null,
      totalSupply: ti.supply ? parseFloat(ti.supply) / Math.pow(10, ti.decimals || 0) : null,
      holders: null,
    };
  });
}

async function testHeliusRpc(token) {
  if (!KEYS.heliusRpc) return { __error: true, msg: 'no rpc' };
  if (token.chain !== 'solana') return { __skipped: true };
  return safeRequest(async () => {
    const { data } = await axios.post(KEYS.heliusRpc, {
      jsonrpc: '2.0', id: 'test', method: 'getTokenSupply', params: [token.address],
    }, { timeout: TIMEOUT });
    if (data.error) return { __error: true, msg: data.error.message };
    const v = data.result?.value;
    return {
      totalSupply: v?.uiAmount ?? null,
      rawSupply: v?.amount ?? null,
      decimals: v?.decimals ?? null,
    };
  });
}

async function testMobula(token) {
  if (!KEYS.mobula) return { __error: true, msg: 'no key' };
  return safeRequest(async () => {
    const { data } = await axios.get('https://api.mobula.io/api/2/token/markets', {
      params: { address: token.address, blockchain: token.chain },
      headers: { Authorization: KEYS.mobula },
      timeout: TIMEOUT,
    });
    if (!data.data || data.data.length === 0) return { __error: true, msg: 'no data' };
    const b = data.data[0].base || {};
    return {
      priceUsd: b.priceUSD ?? null,
      liquidityUsd: b.approximateReserveUSD ?? null,
      marketCapUsd: b.marketCapUSD ?? null,
      fdvUsd: b.marketCapDilutedUSD ?? null,
      totalSupply: b.totalSupply ?? null,
      top10HolderPct: b.top10HoldingsPercentage ?? null,
      insidersPct: b.insidersHoldingsPercentage ?? null,
      bundlersPct: b.bundlersHoldingsPercentage ?? null,
      devPct: b.devHoldingsPercentage ?? null,
      bondingPct: b.bondingPercentage ?? null,
      source: b.source,
    };
  });
}

async function testMoralisAnalytics(token) {
  if (!KEYS.moralis) return { __error: true, msg: 'no key' };
  if (!['ethereum', 'bsc', 'base', 'arbitrum', 'polygon'].includes(token.chain)) return { __skipped: true };
  return safeRequest(async () => {
    const { data } = await axios.get(`https://deep-index.moralis.io/api/v2.2/tokens/${token.address}/analytics`, {
      params: { chain: token.chain === 'ethereum' ? 'eth' : token.chain },
      headers: { 'X-API-Key': KEYS.moralis },
      timeout: TIMEOUT,
    });
    return {
      priceUsd: data.usdPrice ? parseFloat(data.usdPrice) : null,
      liquidityUsd: data.totalLiquidityUsd ? parseFloat(data.totalLiquidityUsd) : null,
      fdvUsd: data.totalFullyDilutedValuation ? parseFloat(data.totalFullyDilutedValuation) : null,
      priceChange24h: data.pricePercentChange?.['24h'] ?? null,
    };
  });
}

async function testMoralisHolders(token) {
  if (!KEYS.moralis) return { __error: true, msg: 'no key' };
  if (!['ethereum', 'bsc', 'base', 'arbitrum', 'polygon'].includes(token.chain)) return { __skipped: true };
  return safeRequest(async () => {
    const { data } = await axios.get(`https://deep-index.moralis.io/api/v2.2/erc20/${token.address}/holders`, {
      params: { chain: token.chain === 'ethereum' ? 'eth' : token.chain },
      headers: { 'X-API-Key': KEYS.moralis },
      timeout: TIMEOUT,
    });
    return {
      holders: data.totalHolders ? parseInt(data.totalHolders, 10) : null,
      top10HolderPercent: data.holderSupply?.top10?.supplyPercent ? parseFloat(data.holderSupply.top10.supplyPercent) : null,
    };
  });
}

async function testCoinGecko(token) {
  if (!KEYS.coingecko) return { __error: true, msg: 'no key' };
  const platformMap = { ethereum: 'ethereum', bsc: 'binance-smart-chain', solana: 'solana', base: 'base', arbitrum: 'arbitrum-one', polygon: 'polygon-pos' };
  const platform = platformMap[token.chain];
  if (!platform) return { __skipped: true };
  return safeRequest(async () => {
    const { data } = await axios.get(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${token.address}`, {
      headers: { 'x-cg-demo-api-key': KEYS.coingecko },
      timeout: TIMEOUT,
    });
    const md = data.market_data || {};
    return {
      priceUsd: md.current_price?.usd ?? null,
      marketCapUsd: md.market_cap?.usd ?? null,
      fdvUsd: md.fully_diluted_valuation?.usd ?? null,
      volume24hUsd: md.total_volume?.usd ?? null,
      priceChange24h: md.price_change_percentage_24h ?? null,
    };
  });
}

const evmProviders = [
  ['DexScreener', testDexScreener],
  ['GeckoTerminal', testGeckoTerminal],
  ['Mobula (v2)', testMobula],
  ['Moralis /analytics', testMoralisAnalytics],
  ['Moralis /holders', testMoralisHolders],
  ['CoinGecko', testCoinGecko],
];
const solanaProviders = [
  ['DexScreener', testDexScreener],
  ['GeckoTerminal', testGeckoTerminal],
  ['Birdeye', testBirdeye],
  ['Helius DAS', testHeliusDAS],
  ['Helius RPC supply', testHeliusRpc],
  ['Mobula (v2)', testMobula],
  ['CoinGecko', testCoinGecko],
];

async function auditToken(token, providers) {
  console.log(`\n\x1b[1m${token.label}\x1b[0m`);
  dim(`  ${token.chain}:${token.address}`);
  let usefulCount = 0;
  for (const [name, fn] of providers) {
    const result = await fn(token);
    if (result.__skipped) { dim(`  ${name.padEnd(20)} → skipped`); continue; }
    if (result.__error) { err(`  ${name.padEnd(20)} → ${result.status || ''} ${result.msg}`); continue; }
    const { present } = summarizeFields(result);
    if (present.length > 0) { ok(`  ${name.padEnd(20)} → ${present.length} fields: ${present.join(', ')}`); usefulCount++; }
    else { dim(`  ${name.padEnd(20)} → 0 fields`); }
  }
  console.log(`  \x1b[1m\x1b[35m→ ${usefulCount} useful providers for this token\x1b[0m`);
}

async function main() {
  header('CORRECTED API AUDIT — fixed endpoints');
  console.log('Changes vs first run:');
  console.log('  • Mobula: was /api/1/market/query?asset= (deprecated) → now /api/2/token/markets?address=');
  console.log('  • Moralis: was /erc20/{addr}/stats (404) → now /tokens/{addr}/analytics + /erc20/{addr}/holders');
  console.log('  • Helius DAS: new getAsset with showFungible=true (returns price_info for old tokens)');
  console.log('  • Replaced WIF (invalid address) with Cai (real fresh pump.fun token)');

  for (const [k, t] of Object.entries(TOKENS)) {
    if (t.chain === 'ethereum') await auditToken(t, evmProviders);
  }
  for (const [k, t] of Object.entries(TOKENS)) {
    if (t.chain === 'solana') await auditToken(t, solanaProviders);
  }

  header('Key insight');
  console.log('Tokens reach enrichment.token.enriched when at least one provider returns data.');
  console.log('Most filters care about: liquidityUsd, marketCapUsd, holders, top10HolderPercent, volume24hUsd.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
