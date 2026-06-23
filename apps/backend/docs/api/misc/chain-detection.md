# Chain Detection (PRO Level)

## Overview
Advanced chain detection using cryptographic validation + RPC verification + on-chain context.

## 1. EVM Chain Detection

### A. Regex Filter (Fast)

```javascript
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function isEvmFormat(address) {
  return EVM_ADDRESS_REGEX.test(address);
}
```

### B. EIP-55 Checksum Validation

```javascript
const keccak256 = require('keccak');

function isValidEip55Checksum(address) {
  const addressLower = address.toLowerCase().replace('0x', '');
  const hash = keccak256(addressLower).toString('hex');
  
  for (let i = 0; i < 40; i++) {
    const char = address[i + 2];
    const shouldBeUpper = parseInt(hash[i], 16) >= 8;
    
    if (shouldBeUpper && char === char.toLowerCase()) return false;
    if (!shouldBeUpper && char === char.toUpperCase()) return false;
  }
  return true;
}

function toChecksumAddress(address) {
  const addressLower = address.toLowerCase();
  const hash = keccak256(addressLower.replace('0x', '')).toString('hex');
  
  return '0x' + [...addressLower.replace('0x', '')].map((char, i) => {
    return parseInt(hash[i], 16) >= 8 ? char.toUpperCase() : char;
  }).join('');
}
```

### C. RPC Verification

```javascript
async function verifyEvmContract(address, rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [address, 'latest'],
      id: 1
    })
  });
  
  const result = await response.json();
  const code = result.result;
  
  return {
    isContract: code !== '0x',
    code: code
  };
}
```

## 2. Solana Detection

### A. Real Base58 Validation

```javascript
const bs58 = require('bs58');

function isValidSolanaAddress(address) {
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

function decodeSolanaAddress(address) {
  return bs58.decode(address);
}
```

### B. RPC Verification

```javascript
async function verifySolanaAccount(address, rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [
        address,
        { encoding: 'base58', commitment: 'confirmed' }
      ]
    })
  });
  
  const result = await response.json();
  
  if (result.error) {
    return { exists: false, error: result.error };
  }
  
  return {
    exists: result.result !== null,
    data: result.result
  };
}
```

## 3. Multi-Chain Inference

```javascript
const CHAIN_CONFIGS = {
  ethereum: {
    rpc: process.env.ETH_RPC,
    method: 'eth_getBalance',
    chainId: 1
  },
  bsc: {
    rpc: process.env.BSC_RPC,
    method: 'eth_getBalance',
    chainId: 56
  },
  polygon: {
    rpc: process.env.POLYGON_RPC,
    method: 'eth_getBalance',
    chainId: 137
  },
  solana: {
    rpc: process.env.SOLANA_RPC,
    method: 'getBalance',
    chainId: 'mainnet'
  }
};

async function probeChain(address, chainConfig) {
  const { rpc, method } = chainConfig;
  
  try {
    const body = method === 'getBalance' 
      ? { jsonrpc: '2.0', id: 1, method, params: [address] }
      : { jsonrpc: '2.0', id: 1, method, params: [address, 'latest'] };
    
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    return { success: true, result: result.result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## 4. Scoring System

```javascript
const SCORING_WEIGHTS = {
  evm: {
    startsWith0x: 40,
    validChecksum: 30,
    rpcResponds: 20,
    hasBalance: 10
  },
  solana: {
    validBase58: 40,
    getAccountInfoExists: 30,
    formatCompatible: 30
  }
};

async function detectChain(address) {
  const scores = { evm: 0, solana: 0, unknown: 0 };
  
  // Format checks
  if (address.startsWith('0x')) {
    scores.evm += SCORING_WEIGHTS.evm.startsWith0x;
    
    if (isValidEip55Checksum(address)) {
      scores.evm += SCORING_WEIGHTS.evm.validChecksum;
    }
  } else if (isValidSolanaAddress(address)) {
    scores.solana += SCORING_WEIGHTS.solana.validBase58;
  }
  
  // RPC probes (parallel)
  const [evmResult, solanaResult] = await Promise.all([
    probeChain(address, CHAIN_CONFIGS.ethereum),
    probeChain(address, CHAIN_CONFIGS.solana)
  ]);
  
  if (evmResult.success) {
    scores.evm += SCORING_WEIGHTS.evm.rpcResponds;
  }
  
  if (solanaResult.success && solanaResult.result) {
    scores.solana += SCORING_WEIGHTS.solana.getAccountInfoExists;
  }
  
  // Determine winner
  if (scores.evm > scores.solana) {
    return { chain: 'evm', confidence: scores.evm / 100 };
  } else if (scores.solana > scores.evm) {
    return { chain: 'solana', confidence: scores.solana / 100 };
  }
  
  return { chain: 'unknown', confidence: 0 };
}
```

## 5. Complete Pipeline

```javascript
async function detectChainPipeline(address) {
  // Step 1: Fast format detection
  const formatResult = detectFormat(address);
  
  if (formatResult.type === 'evm') {
    return { 
      type: 'evm', 
      chain: formatResult.chain || 'ethereum',
      confidence: 0.9
    };
  }
  
  if (formatResult.type === 'solana') {
    return { 
      type: 'solana', 
      chain: 'solana',
      confidence: 0.9
    };
  }
  
  // Step 2: RPC verification for ambiguous cases
  const verified = await verifyViaRpc(address);
  
  if (verified.success) {
    return verified;
  }
  
  return { type: 'unknown', confidence: 0 };
}
```

## Environment Variables

```env
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/your-key
BSC_RPC=https://bsc-dataseed1.binance.org
POLYGON_RPC=https://polygon-rpc.com
SOLANA_RPC=https://api.mainnet-beta.solana.com
```