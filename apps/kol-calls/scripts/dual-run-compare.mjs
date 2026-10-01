#!/usr/bin/env node
/**
 * dual-run-compare.mjs — Tramo 1 todo 15 (C3) dual-run harness.
 *
 * Compares legacy backend published output vs kol-calls shadow published
 * output side-by-side (logs + published diff). Both inputs are JSONL files
 * with one published call per line:
 *   { 'mentionId': 'kol:1:addr:0', 'ticker': 'FOO', 'score': 72 }
 *
 * Usage:
 *   node dual-run-compare.mjs --legacy /tmp/legacy-published.jsonl \
 *     --shadow /tmp/shadow-published.jsonl [--threshold 5]
 *
 * Divergence = (missingEitherSide + fieldMismatches) / max(totalLegacy, totalShadow) * 100.
 * Under threshold -> exit 0 (dual-run clean). Over threshold -> exit 2 and
 * prints the NO-CUTOVER path (investigate, NO cutover — Gate T1).
 * No network, no Telegram posts — pure log comparison.
 */
import { readFileSync } from 'node:fs';

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[idx + 1];
}

function loadJsonl(path) {
  const raw = readFileSync(path, 'utf8');
  const rows = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    rows.push(JSON.parse(trimmed));
  }
  return rows;
}

function keyOf(row) {
  return String(row.mentionId ?? row.id ?? JSON.stringify(row));
}

const legacyPath = arg('--legacy', '');
const shadowPath = arg('--shadow', '');
const threshold = Number(arg('--threshold', '5'));
if (!legacyPath || !shadowPath) {
  console.error('usage: node dual-run-compare.mjs --legacy <file> --shadow <file> [--threshold 5]');
  process.exit(1);
}

const legacy = loadJsonl(legacyPath);
const shadow = loadJsonl(shadowPath);
const legacyById = new Map(legacy.map((r) => [keyOf(r), r]));
const shadowById = new Map(shadow.map((r) => [keyOf(r), r]));

let matched = 0;
let mismatched = 0;
const mismatchedIds = [];
for (const [id, left] of legacyById) {
  const right = shadowById.get(id);
  if (!right) {
    continue;
  }
  const sameTicker = String(left.ticker ?? '') === String(right.ticker ?? '');
  const sameScore = Number(left.score ?? -1) === Number(right.score ?? -2);
  if (sameTicker && sameScore) {
    matched += 1;
  } else {
    mismatched += 1;
    mismatchedIds.push(id);
  }
}
const onlyLegacy = [...legacyById.keys()].filter((id) => !shadowById.has(id));
const onlyShadow = [...shadowById.keys()].filter((id) => !legacyById.has(id));
const denom = Math.max(legacy.length, shadow.length, 1);
const divergence = ((onlyLegacy.length + onlyShadow.length + mismatched) / denom) * 100;

console.log(`legacy: ${legacy.length} shadow: ${shadow.length} matched: ${matched}`);
console.log(`only-legacy: ${onlyLegacy.length} only-shadow: ${onlyShadow.length} mismatched: ${mismatched}`);
console.log(`divergence: ${divergence.toFixed(2)}% threshold: ${threshold}%`);
if (mismatchedIds.length > 0) {
  console.log(`mismatched-ids: ${mismatchedIds.slice(0, 20).join(',')}`);
}
if (divergence > threshold) {
  console.log('DIVERGENCE OVER THRESHOLD -> NO cutover. Path: freeze flags (KOL_CALLS_ENABLED stays shadow-only), diff logs per mentionId, fix kol-calls, re-run dual-run. Gate T1 blocks todo 16.');
  process.exit(2);
}
console.log('dual-run clean: divergence within threshold.');
