#!/usr/bin/env node

/**
 * LLM Arbiter Prompt Evaluation
 *
 * Offline tool: evaluates classification accuracy across 15 test pairs
 * covering DUPLICATE, UPDATE, and DIFFERENT categories.
 * Uses a mock heuristic arbiter (no real LLM needed).
 *
 * Run: node scripts/dedup/llm-prompt-eval.mjs
 */

const TEST_PAIRS = [
  // ── DUPLICATE (5 pairs) ──
  {
    id: 'D1',
    category: 'duplicate',
    textA: 'Bitcoin surges to $100k as institutional buying intensifies',
    textB: 'Bitcoin surges to $100k as institutional buying intensifies',
    expected: 'duplicate',
    notes: 'identical text',
  },
  {
    id: 'D2',
    category: 'duplicate',
    textA: 'Ethereum ETF approved by SEC in landmark decision',
    textB: 'Ethereum ETF gets SEC approval in landmark move',
    expected: 'duplicate',
    notes: 'same event, different words',
  },
  {
    id: 'D3',
    category: 'duplicate',
    textA: 'Binance CEO CZ resigns amid DOJ settlement agreement',
    textB: 'Binance CEO Changpeng Zhao resigns as part of DOJ deal',
    expected: 'duplicate',
    notes: 'names expanded',
  },
  {
    id: 'D4',
    category: 'duplicate',
    textA: 'Solana network experiences 2 hour outage',
    textB: 'Solana blockchain down for 2 hours due to consensus failure',
    expected: 'duplicate',
    notes: 'same event described differently',
  },
  {
    id: 'D5',
    category: 'duplicate',
    textA: 'MicroStrategy buys additional 10000 BTC',
    textB: 'MicroStrategy adds 10000 more Bitcoin to treasury',
    expected: 'duplicate',
    notes: 'synonymous action',
  },

  // ── UPDATE (5 pairs) ──
  {
    id: 'U1',
    category: 'update',
    textA: 'Bitcoin ETF sees $500M inflow on first day',
    textB: 'Bitcoin ETF first week inflows reach $1.2B',
    expected: 'update',
    notes: 'same event, new numbers',
  },
  {
    id: 'U2',
    category: 'update',
    textA: 'Binance hacked for $5M in BSC exploit',
    textB: 'Binance hack losses revised to $7M after additional wallets identified',
    expected: 'update',
    notes: 'updated loss figure',
  },
  {
    id: 'U3',
    category: 'update',
    textA: 'SEC delays decision on Bitcoin ETF',
    textB: 'SEC postpones Bitcoin ETF ruling to March 2025',
    expected: 'update',
    notes: 'new deadline added',
  },
  {
    id: 'U4',
    category: 'update',
    textA: 'FTX begins creditor repayment process',
    textB: 'FTX creditors to receive 95 percent recovery in updated plan',
    expected: 'update',
    notes: 'additional detail on same story',
  },
  {
    id: 'U5',
    category: 'update',
    textA: 'Bitcoin mining difficulty hits new ATH',
    textB: 'Bitcoin mining difficulty adjusts upward by 5.6 percent to new record',
    expected: 'update',
    notes: 'more specific numbers',
  },

  // ── DIFFERENT (5 pairs) ──
  {
    id: 'X1',
    category: 'different',
    textA: 'Bitcoin surges past $50k as ETF anticipation grows',
    textB: 'Bitcoin falls below $45k as Fed signals rate hikes',
    expected: 'different',
    notes: 'opposite price direction',
  },
  {
    id: 'X2',
    category: 'different',
    textA: 'Ethereum completes Shanghai upgrade',
    textB: 'Solana launches new NFT marketplace',
    expected: 'different',
    notes: 'different blockchains',
  },
  {
    id: 'X3',
    category: 'different',
    textA: 'Binance partners with Dubai regulator',
    textB: 'Coinbase expands into UK market',
    expected: 'different',
    notes: 'different companies, regions',
  },
  {
    id: 'X4',
    category: 'different',
    textA: 'Tether mints additional 1B USDT',
    textB: 'Circle mints 500M USDC on Solana chain',
    expected: 'different',
    notes: 'different stablecoins',
  },
  {
    id: 'X5',
    category: 'different',
    textA: 'Crypto market cap reaches $3 trillion',
    textB: 'US dollar index hits 20 year high',
    expected: 'different',
    notes: 'unrelated topics',
  },
];

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s$]/g, '').split(/\s+/).filter((w) => w.length > 0);
}

function extractKeyTerms(text) {
  const tokens = normalize(text);
  // Keep words > 3 chars and cashtags
  return [...new Set(tokens.filter((t) => t.length > 3 || t.startsWith('$')))];
}

function sigWordsOverlap(textA, textB) {
  const wordsA = new Set(extractKeyTerms(textA));
  const wordsB = new Set(extractKeyTerms(textB));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const minSize = Math.min(wordsA.size, wordsB.size);
  return minSize === 0 ? 0 : intersection.size / minSize;
}

function numberOverlap(textA, textB) {
  const numsA = (textA.match(/\d+[.]?\d*[kKmMbBtT]?/g) || []).join(' ');
  const numsB = (textB.match(/\d+[.]?\d*[kKmMbBtT]?/g) || []).join(' ');
  return sigWordsOverlap(numsA, numsB);
}

function mockArbitrate(textA, textB) {
  const wordOverlap = sigWordsOverlap(textA, textB);
  const numOverlap = numberOverlap(textA, textB);

  // High word overlap (> 0.7) → duplicate
  if (wordOverlap > 0.7) {
    return { classification: 'duplicate', confidence: Math.min(0.95, wordOverlap), reason: 'high word overlap' };
  }

  // Moderate word overlap + number overlap → update
  if (wordOverlap > 0.35 && numOverlap > 0) {
    return { classification: 'update', confidence: 0.6 + wordOverlap * 0.2, reason: 'moderate overlap with shared numbers' };
  }

  // Moderate word overlap alone → update
  if (wordOverlap > 0.35) {
    return { classification: 'update', confidence: 0.55 + wordOverlap * 0.15, reason: 'moderate word overlap' };
  }

  // Low word overlap → different
  return { classification: 'different', confidence: 0.7 + (1 - wordOverlap) * 0.2, reason: 'low word overlap' };
}

// ── Evaluation ──

const confusion = { duplicate: { duplicate: 0, update: 0, different: 0 }, update: { duplicate: 0, update: 0, different: 0 }, different: { duplicate: 0, update: 0, different: 0 } };
const confidences = { duplicate: [], update: [], different: [] };
const errors = [];

console.log('\n=== LLM Arbiter Prompt Evaluation Report ===\n');
console.log('Evaluating mock arbiter on 15 test pairs...\n');

console.log('Individual Results:');
console.log('─'.repeat(80));
console.log('ID   Expected       Predicted      Confidence   Notes');
console.log('─'.repeat(80));

for (const pair of TEST_PAIRS) {
  const result = mockArbitrate(pair.textA, pair.textB);
  confusion[pair.expected][result.classification]++;
  confidences[pair.expected].push(result.confidence);

  const status = result.classification === pair.expected ? '✅' : '❌';
  console.log(`${pair.id.padEnd(4)} ${pair.expected.padEnd(13)} ${result.classification.padEnd(13)} ${result.confidence.toFixed(3).padEnd(11)} ${status} ${pair.notes}`);

  if (result.classification !== pair.expected) {
    errors.push({ id: pair.id, expected: pair.expected, got: result.classification, confidence: result.confidence, notes: pair.notes });
  }
}

console.log('\nConfusion Matrix:');
console.log('─'.repeat(50));
console.log('               Predicted');
console.log('             DUP    UPD    DIF');
console.log('─'.repeat(50));
for (const actual of ['duplicate', 'update', 'different']) {
  const short = actual === 'duplicate' ? 'DUP' : actual === 'update' ? 'UPD' : 'DIF';
  const total = Object.values(confusion[actual]).reduce((a, b) => a + b, 0);
  const correct = confusion[actual][actual];
  const pct = total > 0 ? ((correct / total) * 100).toFixed(0) : '100';
  const check = correct === total ? '✅' : '❌';
  console.log(`Actual ${short}  ${String(confusion[actual].duplicate).padStart(5)} ${String(confusion[actual].update).padStart(5)} ${String(confusion[actual].different).padStart(5)}  ${pct}% ${check}`);
}

console.log('\nAccuracy by category:');
let totalCorrect = 0;
let totalPairs = 0;
for (const cat of ['duplicate', 'update', 'different']) {
  const correct = confusion[cat][cat];
  const total = Object.values(confusion[cat]).reduce((a, b) => a + b, 0);
  const pct = ((correct / total) * 100).toFixed(0);
  totalCorrect += correct;
  totalPairs += total;
  const avgConf = confidences[cat].length > 0 ? (confidences[cat].reduce((a, b) => a + b, 0) / confidences[cat].length).toFixed(3) : 'N/A';
  console.log(`  ${cat.padEnd(12)} ${correct}/${total} = ${pct}%  (avg confidence: ${avgConf})`);
}

console.log(`\nOverall accuracy: ${totalCorrect}/${totalPairs} = ${((totalCorrect / totalPairs) * 100).toFixed(0)}%`);

if (errors.length > 0) {
  console.log('\nErrors:');
  for (const e of errors) {
    console.log(`  ❌ ${e.id}: expected ${e.expected}, got ${e.got} (conf ${e.confidence.toFixed(3)}) — ${e.notes}`);
  }
} else {
  console.log('\nErrors: None ✅\n');
}

// Prompt template suggestion
console.log('\nSuggested LLM Prompt Template:');
console.log('─'.repeat(80));
console.log(`SYSTEM:
You are a crypto news editor. Given two news articles, determine if they
describe the EXACT same event (DUPLICATE), the same event with updates
(UPDATE), or different events (DIFFERENT).

Rules:
- DUPLICATE: Same event, same facts, different wording or sources
- UPDATE: Same event but with new/changed information (e.g., new numbers, developments)
- DIFFERENT: Different events, even if same entities are mentioned

Respond with JSON only: { "classification": "DUPLICATE"|"UPDATE"|"DIFFERENT", "confidence": 0.0-1.0, "reason": "brief explanation" }

USER:
Article A: {textA}
Article B: {textB}

Classification:`);
console.log('─'.repeat(80));
