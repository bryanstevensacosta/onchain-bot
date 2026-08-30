#!/bin/bash

# Script to add eslint-disable comments to test files with unsafe-any warnings
# This is a pragmatic approach: tests with mocks inherently deal with 'any' types

files=(
  "apps/backend/src/shared/common/persistence/migrations/__tests__/1840000000000-create-crypto-news-publisher-tables.migration.spec.ts"
  "apps/backend/src/shared/common/persistence/migrations/__tests__/add-ad-media-library.migration.spec.ts"
  "apps/backend/src/shared/common/persistence/migrations/__tests__/create-crypto-news-ads-tables.migration.spec.ts"
  "apps/backend/src/shared/deduplication/application/services/__tests__/llm-arbiter.service.spec.ts"
  "apps/backend/src/shared/llm/adapters/openai.adapter.spec.ts"
  "apps/backend/src/telegram/chain-dexter-bot/infrastructure/telegram/chain-dexter-bot.adapter.spec.ts"
  "apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.spec.ts"
  "apps/backend/src/telegram/ingestion/crypto-news/infrastructure/scheduling/__tests__/media-retention-cleanup.scheduler.spec.ts"
  "apps/backend/src/telegram/ingestion/shared/infrastructure/services/telegram-client-manager.service.spec.ts"
  "apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.spec.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Check if file already has the disable comment
    if ! grep -q "eslint-disable @typescript-eslint/no-unsafe" "$file"; then
      # Add comment at the top after imports
      sed -i '' '1i\
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */\

' "$file"
      echo "✅ Added eslint-disable to: $file"
    else
      echo "⏭️  Already disabled: $file"
    fi
  else
    echo "⚠️  File not found: $file"
  fi
done

echo ""
echo "✨ Done! Run 'npm run lint' to verify."
