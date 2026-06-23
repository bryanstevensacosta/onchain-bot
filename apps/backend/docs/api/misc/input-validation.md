# Input Validation (PRO)

## 1️⃣ Classification Types

| Type | Description |
|------|-------------|
| **ADDRESS** | On‑chain identifier (wallet or contract). Supports Ethereum/EVM and Solana. |
| **SYMBOL** | Token ticker such as `ETH`, `SOL`, `BONK`. |
| **QUERY** | Free‑text user query (e.g., "solana price today"). |
| **INVALID** | Garbage / malformed input. |

## 2️⃣ Base Detection Rules

### 🔷 Ethereum / EVM Address
```regex
^0x[a-fA-F0-9]{40}$
```
* Starts with `0x`
* 40 hex characters (20 bytes)
* Optional checksum (EIP‑55) validation for higher confidence.

### 🟣 Solana Address
* Must be Base58 decodable to **exactly 32 bytes**.
* No regex suffices; perform real Base58 decode.
```javascript
const bs58 = require('bs58');
function isValidSolanaAddress(addr) {
  try { return bs58.decode(addr).length === 32; }
  catch { return false; }
}
```

### 🪙 Symbol (Ticker)
```regex
^[A-Z0-9]{2,10}$
```
* Upper‑case letters/numbers only.
* Length 2‑10 characters.
* Excludes `0x` prefix and whitespace.

### ❌ Free‑text / Noise
Any input that fails the above and contains whitespace, common words (`buy`, `price`, `chart`), or low entropy patterns.

## 3️⃣ Scoring System (Confidence)

| Criterion | Weight |
|-----------|--------|
| **Address** | |
| ‑ Starts with `0x` | +40 |
| ‑ 40‑hex‑char regex match | +30 |
| ‑ Valid EIP‑55 checksum | +20 |
| ‑ Valid Solana Base58 (32 bytes) | +30 |
| ‑ RPC response (balance/code) | +20 |
| **Symbol** | |
| ‑ Upper‑case 2‑10 chars | +40 |
| ‑ Found in known token list (CoinGecko) | +20 |
| ‑ No numbers or special chars | +10 |
| ‑ Contains `0x` | –50 |
| ‑ Contains spaces | –30 |
| **Query / Noise** | |
| ‑ Contains spaces | +50 |
| ‑ Contains common words (`buy`, `price`) | +30 |
| ‑ Looks like a sentence | +20 |

**Final confidence** = (total positive score) / (max possible per type). Choose the highest‑scoring type.

## 4️⃣ Detection Pipeline
```text
INPUT → Normalization (trim, case handling)
   ↓
Step 1: Fast format checks
   • EVM regex → possible ADDRESS
   • Base58 decode → possible SOLANA ADDRESS
   • Symbol regex → possible SYMBOL
   • Anything else → QUERY
   ↓
Step 2: Parallel RPC probes (optional, PRO level)
   • eth_getCode / eth_getBalance (EVM)
   • getAccountInfo / getBalance (Solana)
   • Record success/failure
   ↓
Step 3: Scoring aggregation
   • Apply weights above
   • Compute confidence per type
   ↓
Step 4: Return structured result
```json
{
  "type": "address|symbol|query|invalid",
  "confidence": 0.0‑1.0,
  "chainHint": "ethereum|solana|unknown",
  "reasons": ["regex_match","checksum_valid","rpc_success"]
}
```

## 5️⃣ Edge‑Case Handling
* **Partial address** – e.g. `0x1234` → mark as `invalid` with low confidence.
* **Ambiguous ticker** – e.g. `ONE` may be a token or a word. Resolve by checking known token lists (CoinGecko, DexScreener). If not found, downgrade confidence.
* **Solana fake Base58** – decode failure or length ≠ 32 bytes → `invalid`.
* **Mixed input** – contains both `0x` and spaces → `query`.

## 6️⃣ Production Enhancements (optional)
* **ENS / .sol domain resolution** – resolve human‑readable names to addresses before scoring.
* **Fuzzy ticker lookup** – Levenshtein distance against known tickers for typo tolerance.
* **Blacklist** – common spam words ("free", "airdrop") to downgrade confidence.
* **Cache** – store recent validation results (TTL ≈ 30 min) to avoid repeated RPC calls.

## 7️⃣ Integration Example (Node.js)
```javascript
const { isEvmFormat, isValidEip55Checksum } = require('../utils/validation');
const { isValidSolanaAddress } = require('../chain/solana');
const { detectChain } = require('../chain/detection');

async function classifyInput(raw) {
  const input = raw.trim();

  // Fast format checks
  const isEvm = isEvmFormat(input);
  const isSol = isValidSolanaAddress(input);
  const isSymbol = /^[A-Z0-9]{2,10}$/.test(input);

  // Scoring skeleton
  let scores = { address: 0, symbol: 0, query: 0 };

  if (isEvm) {
    scores.address += 70; // 40 + 30 regex parts
    if (isValidEip55Checksum(input)) scores.address += 20;
  }
  if (isSol) scores.address += 70; // base58 + length

  if (isSymbol) scores.symbol += 40;

  if (input.includes(' ')) scores.query += 50;

  // Parallel RPC probes (optional)
  const [evmRpc, solRpc] = await Promise.all([
    isEvm ? detectChain(input) : Promise.resolve(null),
    isSol ? detectChain(input) : Promise.resolve(null)
  ]);
  if (evmRpc?.rpcResponds) scores.address += 20;
  if (solRpc?.rpcResponds) scores.address += 20;

  // Choose best type
  const best = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a));
  const type = best[0] === 'address' ? 'address' : best[0] === 'symbol' ? 'symbol' : 'query';

  return {
    type,
    confidence: best[1] / 100,
    chainHint: evmRpc?.chain || solRpc?.chain || 'unknown',
    reasons: [] // fill as needed
  };
}
```

---

**Use this document as the definitive guide for robust input validation in any crypto‑focused bot.**