#!/usr/bin/env ts-node
/**
 * CLI tool for recording live messages into fixture files
 * 
 * Usage:
 *   npm run cli:record
 * 
 * Records messages from the real ingestion (MTProto or SSE) and saves them as fixtures
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3030';
const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('┌─────────────────────────────────────┐');
  console.log('│  📼 Message Recording CLI            │');
  console.log('└─────────────────────────────────────┘\n');

  console.log('⚠️  This feature requires backend support for message recording');
  console.log('    Implementation pending: /api/dev/record endpoint\n');

  console.log('For now, you can manually create fixtures by:');
  console.log('  1. Copy message JSON from backend logs');
  console.log('  2. Paste into fixtures/your-fixture.json');
  console.log('  3. Use format from fixtures/ticker-null-bug.json\n');

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
