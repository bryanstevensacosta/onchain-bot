# Honeypot & Risk Detection

## What is a Honeypot?
A token designed to let users **buy** but **block or penalize selling**. It's a liquidity trap controlled by the creator.

## Types of Honeypots

| Type | Description |
|------|-------------|
| **Sell-block** | Buy works, sell reverts |
| **Tax honeypot** | 90–100% sell tax |
| **Dynamic** | Works initially, then blocks later |
| **Proxy trap** | Logic changes after launch |

## Detection Pipeline

```
TOKEN ADDRESS
    ↓
Step 1: Static Analysis
    • Bytecode pattern matching
    • Source code scanning (if verified)
    ↓
Step 2: Tax Simulation
    • Simulate small buy → measure tax
    • Simulate sell → measure slippage
    ↓
Step 3: Sell Simulation
    • Try to sell via fork simulation
    ↓
Step 4: Liquidity Check
    • LP lock status
    • Ownership renounced?
    ↓
Step 5: Holder Analysis
    • Top holder concentration
    • Dev wallet behavior
    ↓
FINAL RISK SCORE
```

## Step 1: Static Analysis

### Red Flag Patterns in Bytecode

```javascript
const RED_FLAG_PATTERNS = [
  /require\s*\(\s*false\s*,/i,           // require(false) - always reverts
  /blacklist\s*\[\s*.*\s*\]/i,           // blacklist mapping
  /isBot\s*\[\s*.*\s*\]/i,                // bot detection
  /tradingEnabled\s*==\s*false/i,        // trading toggle
  /canTrade\s*\(\s*\)/i,                  // trading permission
  /_blacklisted/i,                        // internal blacklist
  /sellAmount.*revert/i,                 // sell block
];
```

### Verified Source Analysis

```javascript
const SUSPICIOUS_PATTERNS = [
  { pattern: /require\s*\(\s*!isBlacklisted/, flag: 'blacklist', weight: 30 },
  { pattern: /require\s*\(\s*tradingEnabled/, flag: 'toggle', weight: 25 },
  { pattern: /require\s*\(\s*_msgSender.*==.*owner/, flag: 'owner_only_sell', weight: 20 },
  { pattern: /uint256.*sellTax/, flag: 'high_sell_tax', weight: 25 },
  { pattern: /function\s+sell\s*\([^)]*\)\s+.*revert/s, flag: 'sell_reverts', weight: 40 },
];
```

## Step 2: Tax Simulation

### Simulate Trade

```javascript
async function simulateTax(tokenAddress, routerAddress, amountIn) {
  const amountsOut = await router.methods.getAmountsOut(amountIn, [
    WETH,
    tokenAddress
  ]).call();
  
  const amountOut = amountsOut[1];
  
  const amountsIn = await router.methods.getAmountsIn(amountOut, [
    tokenAddress,
    WETH
  ]).call();
  
  const tax = ((amountIn - amountsIn[0]) / amountIn) * 100;
  
  return {
    buyTax: 0, // Usually 0 on buy
    sellTax: tax,
    amountIn,
    amountOut,
    expectedOut: amountsIn[0]
  };
}
```

### Risk Thresholds

| Tax | Risk Level |
|-----|------------|
| 0–10% | 🟢 SAFE |
| 10–25% | 🟡 MEDIUM |
| 25–50% | 🟠 HIGH |
| 50–100% | 🔴 HONEYPOT |

## Step 3: Sell Simulation (Fork)

### Using Tenderly (Recommended)

```javascript
const TENDERLY_API = 'https://api.tenderly.co/api/v1';

async function simulateSell(tokenAddress, walletAddress) {
  const response = await fetch(`${TENDERLY_API}/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(process.env.TENDERLY_KEY + ':')}`
    },
    body: JSON.stringify({
      network_id: '1',
      from: walletAddress,
      to: routerAddress,
      input: routerContract.methods.swapExactTokensForETH(
        sellAmount,
        amountOutMin,
        [tokenAddress, WETH],
        walletAddress,
        deadline
      ).encodeABI()
    })
  });
  
  const result = await response.json();
  
  return {
    success: result.transaction.status === 'success',
    revert: result.transaction.error_message,
    gasUsed: result.transaction.gas_used
  };
}
```

## Step 4: Liquidity Analysis

### Check LP Lock Status

```javascript
async function checkLiquidityLock(tokenAddress) {
  const pairAddress = await factory.methods.getPair(tokenAddress, WETH).call();
  const pair = new web3.eth.Contract(UNI_PAIR_ABI, pairAddress);
  
  const [token0, reserves] = await Promise.all([
    pair.methods.token0().call(),
    pair.methods.getReserves().call()
  ]);
  
  const lpAddress = token0 === WETH 
    ? pair.methods.token1().call()
    : pair.methods.token0().call();
  
  const lpContract = new web3.eth.Contract(ERC20_ABI, lpAddress);
  const [lpTotalSupply, lpHolderBalance, lpOwner] = await Promise.all([
    lpContract.methods.totalSupply().call(),
    lpContract.methods.balanceOf(userAddress).call(),
    lpContract.methods.owner().call()
  ]);
  
  return {
    lockedPercent: ((lpTotalSupply - lpHolderBalance) / lpTotalSupply) * 100,
    lpAddress,
    lockStatus: lpOwner === '0x0000000000000000000000000000000000000000' 
      ? 'RENOUNCED' 
      : 'LOCKED_BY_OWNER'
  };
}
```

## Step 5: Holder Analysis

### Top Holder Concentration

```javascript
async function analyzeHolders(tokenAddress) {
  const response = await fetch(
    `https://api.etherscan.io/api?module=token&action=tokentxns&contractaddress=${tokenAddress}&page=1&offset=100&sort=desc&apikey=${process.env.ETHERSCAN_KEY}`
  );
  
  const data = await response.json();
  
  const holderBalances = {};
  data.result.forEach(tx => {
    holderBalances[tx.from] = (holderBalances[tx.from] || 0n) - BigInt(tx.value);
    holderBalances[tx.to] = (holderBalances[tx.to] || 0n) + BigInt(tx.value);
  });
  
  const sorted = Object.entries(holderBalances)
    .filter(([, bal]) => bal > 0n)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const total = sorted.reduce((sum, [, bal]) => sum + bal, 0n);
  const top10Percent = sorted.reduce((sum, [, bal]) => sum + bal, 0n) / total * 100;
  
  return {
    top10HoldersPercent: Number(top10Percent),
    holderCount: Object.keys(holderBalances).length,
    holders: sorted.map(([addr, bal]) => ({ address: addr, balance: bal }))
  };
}
```

## Risk Scoring System

```javascript
function calculateRiskScore(tokenData) {
  let score = 0;
  const flags = [];
  
  // Static analysis
  if (tokenData.sellSimulation.success === false) {
    score += 50;
    flags.push('SELL_REVERT');
  }
  
  if (tokenData.taxSimulation.sellTax > 90) {
    score += 40;
    flags.push('HIGH_SELL_TAX');
  } else if (tokenData.taxSimulation.sellTax > 25) {
    score += 20;
    flags.push('MEDIUM_TAX');
  }
  
  // Liquidity
  if (tokenData.liquidity.lockStatus !== 'RENOUNCED') {
    score += 15;
    flags.push('LP_NOT_RENOUNCED');
  }
  
  if (tokenData.liquidity.lockedPercent < 80) {
    score += 10;
    flags.push('LOW_LP_LOCK');
  }
  
  // Holders
  if (tokenData.holders.top10HoldersPercent > 50) {
    score += 20;
    flags.push('HIGH_CONCENTRATION');
  }
  
  // Determine status
  let status;
  if (score >= 70) status = 'HONEYPOT';
  else if (score >= 40) status = 'RISKY';
  else status = 'SAFE';
  
  return {
    riskScore: score,
    status,
    flags,
    details: tokenData
  };
}
```

## Response Format

```javascript
{
  "riskScore": 75,
  "status": "HONEYPOT",
  "flags": [
    "SELL_REVERT",
    "HIGH_CONCENTRATION"
  ],
  "details": {
    "sellSimulation": { "success": false, "revert": "Transfer failed" },
    "buyTax": 0,
    "sellTax": 95,
    "liquidity": { "lockedPercent": 0, "lockStatus": "UNLOCKED" },
    "holders": { "top10HoldersPercent": 82 }
  }
}
```

## Environment Variables

```env
TENDERLY_KEY=your_tenderly_api_key
ETHERSCAN_KEY=your_etherscan_api_key
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/your-key
```

## Limitations

* Upgradable contracts can change logic after launch
* Anti‑bot detection may block fork simulations
* No detector is 100% perfect

**Recommendation:** Combine risk scoring + simulation + heuristics for best results.