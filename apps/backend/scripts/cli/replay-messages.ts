#!/usr/bin/env ts-node
/**
 * CLI tool for replaying recorded fixture files with timing control
 * 
 * Usage:
 *   npm run cli:replay
 * 
 * Replays messages from a fixture with realistic timing (respects timestamps or uses fixed delay)
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3030';

interface TelegramRawMessage {
  peerId: string;
  messageId: number;
  text: string;
  occurredAt: string;
  media: any[];
  entities: any[];
  groupedId: string | null;
}

interface FixtureFile {
  name: string;
  description: string;
  messages: TelegramRawMessage[];
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listFixtures(): Promise<string[]> {
  const fixturesDir = path.join(__dirname, '../../fixtures');
  if (!fs.existsSync(fixturesDir)) {
    return [];
  }
  return fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
}

async function loadFixture(filename: string): Promise<FixtureFile> {
  const fixturesDir = path.join(__dirname, '../../fixtures');
  const filePath = path.join(fixturesDir, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

async function injectMessage(message: TelegramRawMessage): Promise<void> {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/dev/inject-message`,
      message,
    );
    console.log(`  ✓ Injected message ${message.messageId}`);
  } catch (error: any) {
    console.error(`  ✗ Failed to inject message ${message.messageId}:`, error.response?.data || error.message);
  }
}

async function replayFixture(fixture: FixtureFile, delayMs: number): Promise<void> {
  console.log(`\n▶️  Replaying: ${fixture.name}`);
  console.log(`   Messages: ${fixture.messages.length}`);
  console.log(`   Delay: ${delayMs}ms between messages\n`);

  for (let i = 0; i < fixture.messages.length; i++) {
    const message = fixture.messages[i];
    console.log(`[${i + 1}/${fixture.messages.length}] Sending message ${message.messageId}...`);
    await injectMessage(message);
    
    if (i < fixture.messages.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log('\n✓ Replay complete\n');
}

async function main() {
  console.log('┌─────────────────────────────────────┐');
  console.log('│  ▶️  Message Replay CLI              │');
  console.log('└─────────────────────────────────────┘\n');

  // Check if backend is reachable
  try {
    await axios.get(`${BACKEND_URL}/api/health`);
    console.log(`✓ Backend is running at ${BACKEND_URL}\n`);
  } catch (error) {
    console.error(`✗ Backend not reachable at ${BACKEND_URL}`);
    console.error('  Make sure backend is running in mock mode: npm run dev:mock\n');
    process.exit(1);
  }

  const fixtures = await listFixtures();
  
  if (fixtures.length === 0) {
    console.log('⚠️  No fixtures found in fixtures/ directory\n');
    rl.close();
    return;
  }

  console.log('📦 Available fixtures:');
  fixtures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });

  const choice = await question('\nSelect fixture (number): ');
  const index = parseInt(choice, 10) - 1;

  if (index < 0 || index >= fixtures.length) {
    console.log('Invalid choice');
    rl.close();
    return;
  }

  const fixture = await loadFixture(fixtures[index]);
  
  const delayInput = await question('Delay between messages (ms, default 1000): ');
  const delayMs = delayInput ? parseInt(delayInput, 10) : 1000;

  const confirm = await question(`\nReplay ${fixture.messages.length} messages with ${delayMs}ms delay? (y/n): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled');
    rl.close();
    return;
  }

  await replayFixture(fixture, delayMs);
  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
