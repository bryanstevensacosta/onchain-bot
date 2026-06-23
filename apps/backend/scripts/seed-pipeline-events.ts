/**
 * Seed script to generate fake pipeline events for development.
 *
 * Usage:
 *   npx ts-node scripts/seed-pipeline-events.ts
 *
 * Or import and call from code:
 *   import { seedPipelineEvents } from './scripts/seed-pipeline-events';
 *   await seedPipelineEvents(app);
 */

import { INestApplication, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Sample token addresses (realistic but testnet/fake)
const SAMPLE_TOKENS = [
  { chain: 'solana', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wZGerKFKdBIOy', name: 'USDC' },
  { chain: 'solana', address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL' },
  { chain: 'solana', address: 'DezXAZBKzqfRNnZq2uKX7X1Vdm9uT1EymF6QXELVDm2p', name: 'BOME' },
  { chain: 'ethereum', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', name: 'USDC' },
  { chain: 'ethereum', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', name: 'WBTC' },
  { chain: 'ethereum', address: '0x7Fc66500c84A76Ad7e9c93437bFcEAb6c6d745D8', name: 'AAVE' },
  { chain: 'bsc', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', name: 'CAKE' },
  { chain: 'bsc', address: '0x55d398326f99059fF775485246999027B3197955', name: 'USDT' },
  { chain: 'base', address: '0x4ed4e862860bed51dd9575830dde7d3a4dc94235', name: 'CBBTC' },
  { chain: 'polygon', address: '0x53E0bca35cC3BD57d0b4B27F957b6ABf5c3b9e2F', name: 'MATIC' },
  { chain: 'solana', address: '85VBFQZC9TZkfaptBWqv14ALD9fJVnBhr1MPWc6AZg7H', name: 'GME' },
  { chain: 'ethereum', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', name: 'USDT' },
];

const KOL_NAMES = ['CryptoKing', 'AlphaWhale', 'SolSniper', 'DeFiMaster', 'PumpHunter'];

function randomScore(): number {
  return Math.floor(Math.random() * 100);
}

function randomTier(score: number): string {
  if (score >= 80) return 'STRONG';
  if (score >= 60) return 'DECENT';
  if (score >= 40) return 'NEUTRAL';
  if (score >= 20) return 'RISKY';
  return 'AVOID';
}

function randomClassification(): string {
  const classifications = ['LEGITIMATE', 'UNKNOWN', 'RISKY', 'SAFE'];
  return classifications[Math.floor(Math.random() * classifications.length)];
}

function randomSecurityFlag(classification: string): string {
  const map: Record<string, string> = {
    LEGITIMATE: 'LEGITIMATE',
    UNKNOWN: 'UNKNOWN',
    RISKY: 'SUSPICIOUS',
    SAFE: 'LEGITIMATE',
  };
  return map[classification] || 'UNKNOWN';
}

export async function seedPipelineEvents(
  app: INestApplication,
  options?: { count?: number; delayMs?: number },
): Promise<void> {
  const logger = new Logger('SeedPipelineEvents');
  const eventEmitter = app.get(EventEmitter2);

  const count = options?.count ?? SAMPLE_TOKENS.length;
  const delayMs = options?.delayMs ?? 800;

  logger.log(`Seeding ${count} pipeline events...`);

  for (let i = 0; i < count; i++) {
    const token = SAMPLE_TOKENS[i % SAMPLE_TOKENS.length];
    const kol = KOL_NAMES[Math.floor(Math.random() * KOL_NAMES.length)];
    const score = randomScore();
    const classification = randomClassification();
    const decidedAt = new Date();
    const scoredAt = new Date(decidedAt.getTime() - 1000);

    // 1. Emit normalization.call.normalized
    const normalizationPayload = {
      chain: token.chain,
      address: token.address,
      name: token.name,
      ticker: token.name.slice(0, 4).toUpperCase(),
      kolId: kol,
      normalizedAt: new Date().toISOString(),
    };
    eventEmitter.emit('normalization.call.normalized', {
      event: 'normalization.call.normalized',
      aggregateId: `${token.chain}:${token.address}`,
      payload: normalizationPayload,
    });
    logger.log(`📥 [${i + 1}] normalization.call.normalized: ${token.chain}:${token.address}`);

    await new Promise((resolve) => setTimeout(resolve, delayMs / 3));

    // 2. Emit enrichment.token.enriched
    const enrichmentPayload = {
      chain: token.chain,
      address: token.address,
      priceUsd: Math.random() * 1000,
      liquidityUsd: Math.random() * 500000,
      volume24hUsd: Math.random() * 1000000,
      marketCapUsd: Math.random() * 10000000,
      holders: Math.floor(Math.random() * 10000),
      enrichedAt: new Date().toISOString(),
    };
    eventEmitter.emit('enrichment.token.enriched', {
      event: 'enrichment.token.enriched',
      aggregateId: `${token.chain}:${token.address}`,
      payload: enrichmentPayload,
    });
    logger.log(`📊 [${i + 1}] enrichment.token.enriched: ${token.chain}:${token.address}`);

    await new Promise((resolve) => setTimeout(resolve, delayMs / 3));

    // 3. Emit scoring.token.scored
    const scoredPayload = {
      chain: token.chain,
      address: token.address,
      score,
      tier: randomTier(score),
      classification,
      securityFlag: randomSecurityFlag(classification),
      sourceCount: Math.floor(Math.random() * 5) + 1,
      mentionCount: Math.floor(Math.random() * 20) + 1,
      avgKolReputation: Math.random() * 0.5 + 0.5,
      scoredAt: scoredAt.toISOString(),
    };
    eventEmitter.emit('scoring.token.scored', {
      event: 'scoring.token.scored',
      aggregateId: `${token.chain}:${token.address}`,
      payload: scoredPayload,
    });
    logger.log(`🏆 [${i + 1}] scoring.token.scored: ${token.chain}:${token.address} → ${score} (${randomTier(score)})`);

    await new Promise((resolve) => setTimeout(resolve, delayMs / 3));

    // 4. Emit filters.token.approved or filters.token.rejected
    const isApproved = score >= 50;
    const filterEvent = isApproved ? 'filters.token.approved' : 'filters.token.rejected';
    const filterPayload = {
      chain: token.chain,
      address: token.address,
      score,
      classification,
      decidedAt: decidedAt.toISOString(),
      ...(isApproved
        ? {}
        : {
            reasons: [
              {
                code: score < 50 ? 'SCORE_TOO_LOW' : 'CLASSIFICATION_BLOCKED',
                message: score < 50 ? `Score ${score} below threshold` : `Classification ${classification} blocked`,
              },
            ],
          }),
    };
    eventEmitter.emit(filterEvent, {
      event: filterEvent,
      aggregateId: `${token.chain}:${token.address}`,
      payload: filterPayload,
    });
    logger.log(
      `${isApproved ? '✅' : '❌'} [${i + 1}] ${filterEvent}: ${token.chain}:${token.address} → ${isApproved ? 'APPROVED' : 'REJECTED'}`,
    );

    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.log(`✅ Seeded ${count} pipeline sequences (${count * 4} events total)`);
}

// Allow running directly
if (require.main === module) {
  console.log('This script must be run from within NestJS app context.');
  console.log('Import and call seedPipelineEvents(app) from your bootstrap code.');
}