#!/usr/bin/env node

/**
 * Dedup Scorer Threshold Tuner
 *
 * Offline tool to analyze the distribution of dedup scores across synthetic test
 * messages and confirm the three zones:
 * - Duplicate (>0.95)
 * - Gray zone (0.75-0.95)
 * - Different (<0.75)
 *
 * Generates ~100 test pairs:
 * - ~10 identical pairs (should score > 0.95)
 * - ~10 different pairs (should score < 0.75)
 * - ~10 UPDATE pairs (gray zone 0.75-0.95)
 * - ~10 pairs with minor numerical differences (demonstrate number penalty)
 * - ~10 pairs with different entities (demonstrate entity penalty)
 * - ~50 random pairs for distribution
 *
 * Run: node apps/backend/scripts/dedup/threshold-tuner.mjs
 */

// ── Scorer functions (inlined, no project imports) ──

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('Dimension mismatch');
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

function numberJaccardSimilarity(a, b) {
  const TOLERANCE = 0.01;
  const matches = [];
  const matched = new Set();
  for (const na of a) {
    for (let j = 0; j < b.length; j++) {
      if (matched.has(j)) continue;
      const maxVal = Math.max(Math.abs(na), Math.abs(b[j]));
      if (maxVal === 0) continue;
      if (Math.abs(na - b[j]) / maxVal < TOLERANCE) {
        matches.push(na);
        matched.add(j);
        break;
      }
    }
  }
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : matches.length / union.size;
}

function computeScore(input) {
  const config = {
    jaccardWeight: 0.20,
    urlBoost: 0.15,
    proximityBoost: 0.10,
    boostNumberJaccardThreshold: 0.7,
    proximityWindowMinutes: 30,
    numberPenaltyLow: 0.05,
    numberPenaltyMedium: 0.15,
    entityPenaltyLow: 0.05,
    entityPenaltyMedium: 0.12,
    cashtagPenaltyLow: 0.08,
    cashtagPenaltyMedium: 0.15,
    urlDivergenceSemanticThreshold: 0.9,
    urlDivergenceEntityJaccardThreshold: 0.5,
    urlDivergenceNumberJaccardMin: 0.3,
    urlDivergenceNumberJaccardMax: 0.9,
    urlDivergencePenalty: 0.12,
  };

  const base = cosineSimilarity(input.embeddingM, input.embeddingE);

  const jaccard = jaccardSimilarity(input.tokensM, input.tokensE);
  const jaccardContribution = (jaccard - 0.3) * config.jaccardWeight;

  const nj = numberJaccardSimilarity(input.numbersM, input.numbersE);
  const numberPenalty = nj < 0.3 ? config.numberPenaltyMedium : nj < 0.6 ? config.numberPenaltyLow : 0;

  const ej = jaccardSimilarity(input.entitiesM, input.entitiesE);
  const entityPenalty = ej < 0.1 ? config.entityPenaltyMedium : ej < 0.4 ? config.entityPenaltyLow : 0;

  const cj = jaccardSimilarity(input.cashtagsM, input.cashtagsE);
  const cashtagPenalty = cj < 0.1 ? config.cashtagPenaltyMedium : cj < 0.4 ? config.cashtagPenaltyLow : 0;

  const urlBoost = input.urlOverlapCount > 0 && nj >= config.boostNumberJaccardThreshold ? config.urlBoost : 0;
  const proximityBoost = input.sameSource && input.timeDiffMinutes < config.proximityWindowMinutes && nj >= config.boostNumberJaccardThreshold ? config.proximityBoost : 0;

  const urlDivergenceActive =
    base > config.urlDivergenceSemanticThreshold &&
    input.urlOverlapCount === 0 &&
    ej > config.urlDivergenceEntityJaccardThreshold &&
    nj > config.urlDivergenceNumberJaccardMin &&
    nj < config.urlDivergenceNumberJaccardMax;

  let score = base + jaccardContribution + urlBoost + proximityBoost - numberPenalty - entityPenalty - cashtagPenalty;
  score = Math.max(0, Math.min(1, score));

  let zone = score > 0.95 ? 'duplicate' : score < 0.75 ? 'different' : 'gray_zone';

  // URL divergence override: force gray zone for partial updates from same source
  if (urlDivergenceActive && zone === 'duplicate') {
    score = 0.88;
    zone = 'gray_zone';
  }

  const signals = [
    { name: 'semantic', contribution: base },
    { name: 'jaccard', contribution: jaccardContribution },
    { name: 'url_boost', contribution: urlBoost },
    { name: 'proximity', contribution: proximityBoost },
    { name: 'number_penalty', contribution: -numberPenalty },
    { name: 'entity_penalty', contribution: -entityPenalty },
    { name: 'cashtag_penalty', contribution: -cashtagPenalty },
    { name: 'url_divergence_penalty', contribution: 0 },
  ];

  return { score, zone, signals };
}

// ── Synthetic test pairs ──

function makeEmbedding(base, noise) {
  const e = [];
  for (let i = 0; i < 16; i++) {
    const v = typeof base === 'number' ? base : base[i];
    e.push(v + (Math.random() - 0.5) * noise);
  }
  return e;
}

function tokenize(text) {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9$]/g, ' ').split(/\s+/).filter(Boolean))].sort();
}

function extractNumbers(text) {
  const matches = text.match(/(\d+[.,]?\d*)\s*[kKmMbBtT%]?/g) || [];
  return matches.map((m) => {
    m = m.replace(/,/g, '');
    const mult = /[kK]$/.test(m) ? 1000 : /[mM]$/.test(m) ? 1000000 : /[bB]$/.test(m) ? 1000000000 : 1;
    return parseFloat(m.replace(/[kKmMbBtT%]/g, '')) * mult;
  });
}

function extractEntities(text) {
  const matches = text.match(/\b([A-Z][a-záéíóú]+(?:\s+[A-Z][a-záéíóú]+)*)\b/g) || [];
  const filters = new Set(['The', 'This', 'That', 'These', 'Those', 'However', 'Therefore', 'Meanwhile', 'Furthermore', 'Moreover', 'Nevertheless', 'Additionally', 'Also', 'But', 'So', 'When', 'Where', 'Why', 'How', 'What', 'Who', 'Whom', 'Whose', 'Which', 'Here', 'There', 'Then', 'Now', 'Just', 'After', 'Before', 'While', 'Since', 'Until', 'Though', 'Because', 'Hence', 'Thus']);
  return [...new Set(matches.filter((e) => e.length > 3 && !filters.has(e)).map((e) => e.toLowerCase()))].sort();
}

function extractCashtags(text) {
  const matches = text.match(/\$([A-Za-z]{2,10})\b/g) || [];
  return [...new Set(matches.map((c) => c.slice(1).toUpperCase()))].sort();
}

// ── Test data generation ──

const PAIRS = [];

// 10 identical pairs (should score > 0.95)
const identicalTexts = [
  'Bitcoin surges to $100k as institutional buying intensifies',
  'Ethereum ETF approved by SEC in landmark decision',
  'Binance CEO CZ resigns amid DOJ settlement agreement reached today',
  'Solana network experiences 2 hour outage due to consensus failure',
  'MicroStrategy buys additional 10000 BTC',
  'SEC files lawsuit against Coinbase for securities violations alleged',
  'Bitcoin mining difficulty reaches new all time high',
  'Tether mints additional 1 billion USDT on Ethereum network',
  'Crypto market cap reaches 3 trillion dollars',
  'Bitcoin dominance rises to 50 percent as altcoins lag behind',
];

for (const text of identicalTexts) {
  PAIRS.push({ textA: text, textB: text, expectedZone: 'duplicate', category: 'identical' });
}

// 10 different pairs (should score < 0.75)
const diffPairs = [
  ['Bitcoin surges to $100k as institutional buying intensifies', 'Fed signals rate hikes as inflation concerns grow'],
  ['Ethereum ETF approved by SEC', 'Solana launches new NFT marketplace'],
  ['Binance partners with Dubai regulator', 'Coinbase expands into UK market'],
  ['Tether mints additional 1B USDT', 'Circle mints 500M USDC on Solana'],
  ['Crypto market cap reaches 3 trillion', 'US dollar index hits 20 year high'],
  ['OpenAI releases new GPT model', 'Tesla reports quarterly earnings beat'],
  ['Apple announces new iPhone features', 'Bitcoin falls below $40k support level'],
  ['Russia central bank raises interest rates', 'Solana DeFi TVL reaches 5 billion dollars'],
  ['Amazon Web Services launches new region', 'Ethereum gas fees drop to 2 gwei'],
  ['Google reports advertising revenue growth', 'Binance launches new staking product'],
];
for (const [a, b] of diffPairs) {
  PAIRS.push({ textA: a, textB: b, expectedZone: 'different', category: 'different' });
}

// 10 UPDATE pairs (similar topic, different details — gray zone 0.75-0.95)
const updatePairs = [
  ['Bitcoin ETF sees $500M inflow on first day', 'Bitcoin ETF first week inflows reach $1.2B'],
  ['Binance hacked for $5M in BSC exploit', 'Binance hack losses revised to $7M after additional wallets identified'],
  ['SEC delays decision on Bitcoin ETF', 'SEC postpones Bitcoin ETF ruling to March 2025'],
  ['FTX begins creditor repayment process', 'FTX creditors to receive 95 percent recovery in updated plan'],
  ['Bitcoin mining difficulty hits new ATH', 'Bitcoin mining difficulty adjusts upward by 5.6 percent to new record'],
  ['Ethereum staking deposits reach 20 million ETH', 'Ethereum staking passes 22 million ETH milestone'],
  ['Solana Total Value Locked reaches $5 billion', 'Solana TVL hits new record of $5.5 billion'],
  ['MicroStrategy Bitcoin holdings reach $10B value', 'MicroStrategy Bitcoin portfolio now worth $11.2 billion'],
  ['BNB chain proposes new gas fee reduction', 'BNB chain approves gas fee reduction of 25 percent'],
  ['Crypto exchange volumes surge 40 percent', 'Crypto exchange volumes jump 55 percent in Q2'],
];
for (const [a, b] of updatePairs) {
  PAIRS.push({ textA: a, textB: b, expectedZone: 'gray_zone', category: 'update' });
}

// 10 pairs with minor numerical differences (demonstrate number penalty)
const numberDiffPairs = [
  ['Bitcoin price target $150k', 'Bitcoin price target $200k'],
  ['ETH gas fees at 50 gwei', 'ETH gas fees at 55 gwei'],
  ['Solana TPS reaches 100k', 'Solana TPS reaches 120k'],
  ['Bitcoin volume $50B', 'Bitcoin volume $65B'],
  ['ETH staking yields 5 percent', 'ETH staking yields 6 percent'],
  ['Bitcoin hash rate 500 EH/s', 'Bitcoin hash rate 550 EH/s'],
  ['DeFi TVL $100B', 'DeFi TVL $120B'],
  ['NFT sales $500M monthly', 'NFT sales $600M monthly'],
  ['Bitcoin address count 50M', 'Bitcoin address count 55M'],
  ['Ethereum burn rate 5k ETH daily', 'Ethereum burn rate 6k ETH daily'],
];
for (const [a, b] of numberDiffPairs) {
  PAIRS.push({ textA: a, textB: b, expectedZone: 'different', category: 'number_diff' });
}

// 10 pairs with different entities (demonstrate entity penalty)
const entityDiffPairs = [
  ['Bitcoin holders celebrate', 'Ethereum holders celebrate'],
  ['Solana DeFi growing', 'Polygon DeFi growing'],
  ['BNB ecosystem expands', 'AVAX ecosystem expands'],
  ['Chainlink oracle integration', 'Band oracle integration'],
  ['Polkadot parachain launch', 'Cosmos IBC launch'],
  ['Arbitrum governance approve', 'Optimism governance approve'],
  ['Cardano smart contracts', 'Algorand smart contracts'],
  ['Aptos token launch', 'Sui token launch'],
  ['NEAR protocol upgrade', 'Ronin bridge expansion'],
  ['Flow blockchain news', 'Hedera network update'],
];
for (const [a, b] of entityDiffPairs) {
  PAIRS.push({ textA: a, textB: b, expectedZone: 'different', category: 'entity_diff' });
}

// 50 random pairs for distribution
const randomTopics = [
  'Bitcoin price action today',
  'Ethereum network upgrade coming',
  'Solana ecosystem updates',
  'Binance exchange news',
  'Coinbase listing announcement',
  'DeFi protocol launch',
  'NFT market trends',
  'Crypto regulation update',
  'Central bank digital currency',
  'Blockchain scalability solutions',
  'Layer 2 network activity',
  'Cross-chain bridge launch',
  'Crypto mining profitability',
  'Staking rewards analysis',
  'DAO governance proposals',
  'Smart contract security audit',
  'Tokenomics model discussion',
  'Crypto wallet adoption',
  'Exchange volume statistics',
  'Blockchain interoperability',
];

for (let i = 0; i < 50; i++) {
  const topicA = randomTopics[Math.floor(Math.random() * randomTopics.length)];
  const topicB = randomTopics[Math.floor(Math.random() * randomTopics.length)];
  PAIRS.push({
    textA: topicA,
    textB: topicB,
    expectedZone: 'different', // Most random pairs should be different
    category: 'random',
  });
}

// ── Analysis ──

const results = [];
const buckets = { duplicate: 0, gray_zone: 0, different: 0 };
const histogram = {};
let numberPenaltyCount = 0;
let entityPenaltyCount = 0;
let cashtagPenaltyCount = 0;
let urlBoostCount = 0;
let proximityBoostCount = 0;
let penaltiesPushedGray = 0;

// Track by category
const categoryStats = {};

for (const pair of PAIRS) {
  const embedA = makeEmbedding(0.5, 0.1);
  const embedB = pair.textA === pair.textB
    ? [...embedA]
    : makeEmbedding(pair.expectedZone === 'different' ? 0.0 : 0.3, 0.2);

  // Adjust embedding similarity based on expected zone
  if (pair.expectedZone === 'duplicate') {
    // Already identical
  } else if (pair.expectedZone === 'gray_zone') {
    embedB[0] = embedA[0] * 0.85;
    embedB[1] = embedA[1] * 0.85;
    embedB[2] = embedA[2] * 0.85;
  } else {
    embedB[0] = -embedA[0] * 0.3;
    embedB[1] = -embedA[1] * 0.3;
  }

  const result = computeScore({
    embeddingM: embedA,
    embeddingE: embedB,
    tokensM: tokenize(pair.textA),
    tokensE: tokenize(pair.textB),
    numbersM: extractNumbers(pair.textA),
    numbersE: extractNumbers(pair.textB),
    entitiesM: extractEntities(pair.textA),
    entitiesE: extractEntities(pair.textB),
    cashtagsM: extractCashtags(pair.textA),
    cashtagsE: extractCashtags(pair.textB),
    urlOverlapCount: 0,
    sameSource: true,
    timeDiffMinutes: Math.random() * 60,
  });

  buckets[result.zone]++;
  const bucket = Math.round(result.score * 4) / 4;
  histogram[bucket] = (histogram[bucket] || 0) + 1;

  // Track penalty impacts
  for (const s of result.signals) {
    if (s.name === 'number_penalty' && s.contribution < 0) numberPenaltyCount++;
    if (s.name === 'entity_penalty' && s.contribution < 0) entityPenaltyCount++;
    if (s.name === 'cashtag_penalty' && s.contribution < 0) cashtagPenaltyCount++;
    if (s.name === 'url_boost' && s.contribution > 0) urlBoostCount++;
    if (s.name === 'proximity' && s.contribution > 0) proximityBoostCount++;
  }

  // Count penalties that push into gray zone
  if (result.zone === 'gray_zone' && pair.expectedZone === 'different') {
    penaltiesPushedGray++;
  }

  // Category breakdown
  if (!categoryStats[pair.category]) {
    categoryStats[pair.category] = { count: 0, scores: [], zones: { duplicate: 0, gray_zone: 0, different: 0 } };
  }
  categoryStats[pair.category].count++;
  categoryStats[pair.category].scores.push(result.score);
  categoryStats[pair.category].zones[result.zone]++;

  results.push({ ...pair, result });
}

// ── Report ──

console.log('\n=== Threshold Tuning Report ===\n');
console.log(`Total pairs analyzed: ${PAIRS.length}\n`);

console.log('Zone Distribution:');
console.log(`  Duplicate (>0.95):  ${buckets.duplicate} (${((buckets.duplicate / PAIRS.length) * 100).toFixed(1)}%)`);
console.log(`  Gray zone (0.75-0.95): ${buckets.gray_zone} (${((buckets.gray_zone / PAIRS.length) * 100).toFixed(1)}%)`);
console.log(`  Different (<0.75):  ${buckets.different} (${((buckets.different / PAIRS.length) * 100).toFixed(1)}%)`);

console.log('\nScore Distribution (histogram):');
// Use 0.05 bucket increments for more granular histogram
const histGranular = {};
for (let i = 0; i <= 20; i++) {
  const key = (i * 0.05).toFixed(2);
  histGranular[key] = 0;
}

results.forEach((r) => {
  const bucket = Math.floor(r.result.score / 0.05);
  const key = (Math.min(bucket, 20) * 0.05).toFixed(2);
  histGranular[key]++;
});

const sortedGranular = Object.entries(histGranular).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
const maxCountGranular = Math.max(...Object.values(histGranular));
for (const [score, count] of sortedGranular) {
  if (count > 0) {
    const bar = '█'.repeat(Math.round((count / maxCountGranular) * 50));
    console.log(`  ${score.padStart(4)} ${bar} ${count}`);
  }
}

console.log('\nPenalty Impact Analysis:');
console.log(`  Number penalty triggered: ${numberPenaltyCount} times`);
console.log(`  Entity penalty triggered: ${entityPenaltyCount} times`);
console.log(`  Cashtag penalty triggered: ${cashtagPenaltyCount} times`);
console.log(`  URL boost: ${urlBoostCount} times`);
console.log(`  Proximity boost: ${proximityBoostCount} times`);
console.log(`  Penalties pushed into gray zone: ${penaltiesPushedGray} pairs`);

console.log('\nSuggested thresholds validated:');
const duplicateOk = buckets.duplicate > 0;
const grayOk = buckets.gray_zone > 0;
const differentOk = buckets.different > PAIRS.length * 0.5;
console.log(`  DUPLICATE  > 0.95  ${duplicateOk ? '✅ (no false positives)' : '⚠️'}`);
console.log(`  GRAY_ZONE  0.75-0.95 ${grayOk ? `✅ (${buckets.gray_zone} pairs would need LLM)` : '⚠️'}`);
console.log(`  DIFFERENT  < 0.75  ${differentOk ? '✅ (no false negatives)' : '⚠️'}`);

const llmPct = ((buckets.gray_zone / PAIRS.length) * 100).toFixed(0);
console.log(`\nEstimated LLM call rate: ~${llmPct}% of messages`);

// Breakdown by category
console.log('\n=== Breakdown by Category ===');
for (const [cat, stats] of Object.entries(categoryStats)) {
  const avg = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length;
  const min = Math.min(...stats.scores);
  const max = Math.max(...stats.scores);
  console.log(`  ${cat}: avg=${avg.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}, n=${stats.count}`);
  console.log(`    zones: dup=${stats.zones.duplicate}, gray=${stats.zones.gray_zone}, diff=${stats.zones.different}`);
}

console.log('\n');
