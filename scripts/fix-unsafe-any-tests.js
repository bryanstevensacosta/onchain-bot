#!/usr/bin/env node

/**
 * Script to fix common unsafe-any warnings in test files.
 * Applies type assertions to common patterns.
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'apps/backend/src/shared/common/persistence/migrations/__tests__/1840000000000-create-crypto-news-publisher-tables.migration.spec.ts',
  'apps/backend/src/shared/common/persistence/migrations/__tests__/add-ad-media-library.migration.spec.ts',
  'apps/backend/src/shared/common/persistence/migrations/__tests__/create-crypto-news-ads-tables.migration.spec.ts',
  'apps/backend/src/shared/deduplication/application/services/__tests__/llm-arbiter.service.spec.ts',
  'apps/backend/src/shared/llm/adapters/openai.adapter.spec.ts',
  'apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/chain-dexter-bot.adapter.spec.ts',
  'apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.spec.ts',
  'apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.spec.ts',
  'apps/backend/src/telegram/ingestion/crypto-news/infrastructure/scheduling/__tests__/media-retention-cleanup.scheduler.spec.ts',
  'apps/backend/src/telegram/ingestion/shared/infrastructure/services/telegram-client-manager.service.spec.ts',
  'apps/backend/src/telegram/vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.spec.ts',
  'apps/backend/src/telegram/vip-calls/vip-channel/application/handlers/vip-calls-publish.use-case.tryreserve.spec.ts',
  'apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/ticker-null-bug-exploration.spec.ts',
  'apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-bug-exploration.spec.ts',
  'apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.spec.ts',
  'apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.spec.ts',
];

/**
 * Apply common type assertion patterns
 */
function applyFixes(content) {
  let fixed = content;

  // Pattern 1: mock.calls[0][0] access -> add type assertion
  // const callArg = mock.calls[0][0];
  // -> const callArg = mock.calls[0][0] as Record<string, any>;
  fixed = fixed.replace(
    /const\s+(\w+)\s*=\s*(\w+)\.mock\.calls\[(\d+)\]\[(\d+)\];/g,
    'const $1 = $2.mock.calls[$3][$4] as Record<string, any>;'
  );

  // Pattern 2: Direct mock.calls access in expect
  // expect(mock.calls[0][0].property)
  // -> expect((mock.calls[0][0] as any).property)
  fixed = fixed.replace(
    /expect\((\w+)\.mock\.calls\[(\d+)\]\[(\d+)\]\.(\w+)\)/g,
    'expect(($1.mock.calls[$2][$3] as Record<string, any>).$4)'
  );

  // Pattern 3: Query result array access
  // const result = await query(...);
  // result[0].column
  // -> (result as Array<Record<string, any>>)[0].column
  fixed = fixed.replace(
    /(\w+)\[(\d+)\]\.(\w+)/g,
    (match, varName, index, prop) => {
      // Only apply if it looks like a query result pattern
      if (varName === 'rows' || varName === 'result' || varName === 'records') {
        return `(${varName} as Array<Record<string, any>>)[${index}].${prop}`;
      }
      return match;
    }
  );

  // Pattern 4: Assignment from mock.calls
  // const x = mock.calls[0];
  // -> const x = mock.calls[0] as any[];
  fixed = fixed.replace(
    /const\s+(\w+)\s*=\s*(\w+)\.mock\.calls\[(\d+)\];/g,
    'const $1 = $2.mock.calls[$3] as any[];'
  );

  // Pattern 5: mockImplementation with input parameter
  // .mockImplementation(async (input) => {
  // -> .mockImplementation(async (input: any) => {
  fixed = fixed.replace(
    /\.mockImplementation\(async\s*\((\w+)\)\s*=>/g,
    '.mockImplementation(async ($1: any) =>'
  );
  fixed = fixed.replace(
    /\.mockImplementation\(\((\w+)\)\s*=>/g,
    '.mockImplementation(($1: any) =>'
  );

  return fixed;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fixed = applyFixes(content);

  if (content !== fixed) {
    fs.writeFileSync(fullPath, fixed, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  } else {
    console.log(`⏭️  No changes: ${filePath}`);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Fixing unsafe-any warnings in test files...\n');

  let fixedCount = 0;
  let totalCount = 0;

  for (const file of filesToFix) {
    totalCount++;
    if (processFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\n✨ Done! Fixed ${fixedCount}/${totalCount} files.`);
  console.log('\n💡 Run "npm run lint" to verify the changes.');
}

main();
