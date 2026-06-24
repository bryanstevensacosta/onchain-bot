# Token Symbol Resolution

## Overview
When user sends `/token PEPE`, resolve symbol to contract address.

## Strategies

### 1. CoinGecko Search (Primary)

```javascript
async function resolveSymbolToAddress(symbol) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`
  );
  
  const data = await response.json();
  
  const exactMatch = data.coins.find(
    coin => coin.symbol.toLowerCase() === symbol.toLowerCase()
  );
  
  if (exactMatch) {
    return {
      address: exactMatch.id, // CoinGecko ID
      symbol: exactMatch.symbol,
      name: exactMatch.name,
      thumb: exactMatch.thumb,
      marketCapRank: exactMatch.market_cap_rank
    };
  }
  
  return null;
}
```

### 2. DexScreener Search

```javascript
async function searchTokenOnDexScreener(symbol) {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`
  );
  
  const data = await response.json();
  
  if (data.pairs && data.pairs.length > 0) {
    const bestPair = data.pairs[0];
    return {
      address: bestPair.baseToken.address,
      symbol: bestPair.baseToken.symbol,
      name: bestPair.baseToken.name,
      dexId: bestPair.dexId,
      pairAddress: bestPair.pairAddress
    };
  }
  
  return null;
}
```

### 3. Multi-Source Resolution

```javascript
async function resolveTokenInput(input) {
  const normalized = input.trim().toLowerCase();
  
  // Check if it's an address
  if (normalized.startsWith('0x') && normalized.length === 42) {
    return { type: 'address', value: normalized };
  }
  
  // Try to resolve symbol
  const sources = [
    { name: 'coingecko', fn: () => resolveSymbolToAddress(input) },
    { name: 'dexscreener', fn: () => searchTokenOnDexScreener(input) }
  ];
  
  for (const source of sources) {
    try {
      const result = await source.fn();
      if (result) {
        return { 
          type: 'symbol', 
          value: result.address,
          symbol: result.symbol,
          name: result.name,
          source: source.name
        };
      }
    } catch (error) {
      console.error(`${source.name} failed:`, error);
    }
  }
  
  return null;
}
```

## Resolution Pipeline

```javascript
async function resolveToken(input) {
  const cleaned = input.trim();
  
  // Case 1: Direct address (0x...)
  if (isEvmFormat(cleaned)) {
    const chain = await detectChain(cleaned);
    return { address: cleaned, chain: chain.chain };
  }
  
  // Case 2: Solana address (base58)
  if (isValidSolanaAddress(cleaned)) {
    return { address: cleaned, chain: 'solana' };
  }
  
  // Case 3: Symbol lookup
  const resolved = await resolveTokenInput(cleaned);
  if (resolved) {
    return resolved;
  }
  
  throw new Error(`Could not resolve: ${input}`);
}
```

## Rate Limits
- CoinGecko: 10-30 calls/minute (free tier)
- DexScreener: 100 calls/minute (free tier)

## Caching Strategy
```javascript
const tokenCache = new Map();

function getCachedToken(address) {
  const cached = tokenCache.get(address.toLowerCase());
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour
    return cached.data;
  }
  return null;
}

function setCachedToken(address, data) {
  tokenCache.set(address.toLowerCase(), {
    data,
    timestamp: Date.now()
  });
}
```