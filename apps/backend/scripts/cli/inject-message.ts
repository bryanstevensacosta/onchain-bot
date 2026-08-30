#!/usr/bin/env ts-node
/**
 * CLI tool for injecting messages into the mock ingestion adapter
 * 
 * Usage:
 *   npm run cli:inject
 * 
 * Requires backend to be running in mock mode: npm run dev:mock
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
    console.log('✓ Message injected:', response.data);
  } catch (error: any) {
    console.error('✗ Failed to inject message:', error.response?.data || error.message);
    throw error;
  }
}

async function injectFromFixture(): Promise<void> {
  const fixtures = await listFixtures();
  
  if (fixtures.length === 0) {
    console.log('\n⚠️  No fixtures found in fixtures/ directory');
    console.log('Create a fixture file first (see fixtures/ticker-null-bug.json as example)\n');
    return;
  }

  console.log('\n📦 Available fixtures:');
  fixtures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });

  const choice = await question('\nSelect fixture (number): ');
  const index = parseInt(choice, 10) - 1;

  if (index < 0 || index >= fixtures.length) {
    console.log('Invalid choice');
    return;
  }

  const fixture = await loadFixture(fixtures[index]);
  console.log(`\n📄 Fixture: ${fixture.name}`);
  console.log(`   Description: ${fixture.description}`);
  console.log(`   Messages: ${fixture.messages.length}`);

  const confirm = await question('\nInject these messages? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled');
    return;
  }

  console.log('\n💉 Injecting messages...');
  for (const message of fixture.messages) {
    await injectMessage(message);
  }
  console.log('\n✓ All messages injected\n');
}

async function injectCustom(): Promise<void> {
  console.log('\n📝 Custom message injection');
  
  const peerId = await question('Peer ID (e.g., -1001234567890): ');
  const messageId = parseInt(await question('Message ID (e.g., 12345): '), 10);
  const text = await question('Message text: ');

  const message: TelegramRawMessage = {
    peerId,
    messageId,
    text,
    occurredAt: new Date().toISOString(),
    media: [],
    entities: [],
    groupedId: null,
  };

  console.log('\n📤 Injecting message...');
  await injectMessage(message);
  console.log('✓ Message injected\n');
}

async function main() {
  console.log('┌─────────────────────────────────────┐');
  console.log('│  🧪 Mock Message Injection CLI      │');
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

  console.log('Options:');
  console.log('  1. Inject from fixture file');
  console.log('  2. Inject custom message');
  console.log('  3. Exit\n');

  const choice = await question('Select option: ');

  switch (choice) {
    case '1':
      await injectFromFixture();
      break;
    case '2':
      await injectCustom();
      break;
    case '3':
      console.log('Goodbye!\n');
      break;
    default:
      console.log('Invalid option\n');
  }

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
