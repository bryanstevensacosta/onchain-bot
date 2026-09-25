#!/usr/bin/env node
/**
 * SLO probe (Tramo 3, todo 5, G-17): measures market-data p50/p95/max
 * with a realistic burst, then asserts p95 < 500ms.
 *
 * Load shape (fits the 60 req/min/IP edge guard in one window):
 * - 5 cache-warming GETs (reported separately as cold numbers)
 * - 50 sequential snapshot GETs over 10 addresses (cache-warm)
 * - 2 batch-50 POSTs (the plan acceptance: batch 50 tokens OK)
 *
 * Usage: node scripts/measure-slo.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:4000';
const SLO_P95_MS = 500;

const ADDRESSES = Array.from(
  { length: 10 },
  (_, i) =>
    `So111111111111111111111111111111111111111${String(i).padStart(2, '0')}`,
);

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: samples.length,
    min: Math.min(...samples),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: Math.max(...samples),
  };
}

async function timed(fn) {
  const start = performance.now();
  const res = await fn();
  return { ms: performance.now() - start, res };
}

async function main() {
  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) throw new Error(`health check failed: ${health.status}`);
  console.log(`health: ${(await health.text()).trim()}`);

  const cold = [];
  for (let i = 0; i < 5; i += 1) {
    const { ms } = await timed(() =>
      fetch(
        `${BASE}/api/market-data/snapshot?chain=solana&address=${ADDRESSES[i % ADDRESSES.length]}`,
      ).then((r) => {
        if (!r.ok) throw new Error(`warmup failed: ${r.status}`);
        return r.json();
      }),
    );
    cold.push(ms);
  }
  const coldStats = stats(cold);
  console.log(`warmup (cold, MISS): ${JSON.stringify(coldStats)}`);

  const warm = [];
  for (let round = 0; round < 5; round += 1) {
    for (const addr of ADDRESSES) {
      const { ms, res } = await timed(() =>
        fetch(`${BASE}/api/market-data/snapshot?chain=solana&address=${addr}`),
      );
      if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
      await res.json();
      warm.push(ms);
    }
  }
  const warmStats = stats(warm);
  console.log(`burst 50x snapshot GET (warm): ${JSON.stringify(warmStats)}`);

  const batch = [];
  for (let b = 0; b < 2; b += 1) {
    const items = Array.from({ length: 50 }, (_, i) => ({
      chain: 'solana',
      address: ADDRESSES[i % ADDRESSES.length],
    }));
    const { ms, res } = await timed(() =>
      fetch(`${BASE}/api/v1/addresses/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    );
    if (!res.ok) throw new Error(`batch failed: ${res.status}`);
    const body = await res.json();
    if (body.snapshots?.length !== 50) {
      throw new Error(`batch returned ${body.snapshots?.length ?? 0}/50`);
    }
    batch.push(ms);
  }
  const batchStats = stats(batch);
  console.log(`batch 2x POST-50 (acceptance): ${JSON.stringify(batchStats)}`);

  const pass = warmStats.p95 < SLO_P95_MS;
  console.log(
    `SLO p95<${SLO_P95_MS}ms on warm burst: ${pass ? 'PASS' : 'FAIL'} (p95=${warmStats.p95.toFixed(2)}ms)`,
  );
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(`SLO probe failed: ${err.message}`);
  process.exit(1);
});
