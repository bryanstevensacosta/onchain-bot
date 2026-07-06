---
slug: crypto-news-publisher
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-publisher.md
approach: New BC at apps/backend/src/telegram/crypto-news-publisher/ with queue-based throttled publishing. Reuses TelegramPublisherPort from shared/. Generic shared/llm/ for LLM abstraction.
---

# Draft: crypto-news-publisher

## Findings

1. `apps/backend/src/telegram/shared/domain/ports/telegram-publisher.port.ts:9` — existing `TelegramPublisherPort` abstract class (sendMessage). Reusable.
2. `apps/backend/src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` — existing adapter implementing the port. Can be reused.
3. `apps/backend/src/telegram/vip-calls/vip-channel/vip-channel.module.ts` — example BC modular structure with publisher integration.
4. `apps/backend/src/telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event.ts` — existing event fired after message ingest.
5. No existing LLM integration in the project.
6. No DB for keywords or queue.

## Architecture

```
apps/backend/src/
├── shared/
│   └── llm/                                         # NEW: Generic LLM
│       ├── llm.port.ts                              # Abstract: generateText(prompt)
│       └── adapters/
│           └── openai.adapter.ts                    # OpenAI GPT integration
└── telegram/
    └── crypto-news-publisher/                       # NEW BC
        ├── domain/
        │   ├── entities/
        │   │   ├── keyword.entity.ts                # AggregateRoot: id, phrase, caseSensitive, enabled
        │   │   └── published-article.queue-entry.ts # id, messageId, channelId, content, media[], linkPreview, orderedAt, status
        │   ├── value-objects/
        │   │   ├── publish-status.vo.ts
        │   │   └── article-text.vo.ts
        │   └── events/
        │       └── article-published.event.ts
        ├── application/
        │   ├── handlers/
        │   │   ├── enqueue-matching-messages.handler.ts # EventBus listener
        │   │   └── process-next-queued-article.use-case.ts
        │   ├── scheduling/
        │   │   └── publisher-cron.scheduler.ts        # Every minute, check queue
        │   ├── ports/
        │   │   ├── keyword.repository.ts
        │   │   ├── queue.repository.ts
        │   │   └── article-publisher.port.ts        # Re-export TelegramPublisherPort? Or just inject
        │   └── services/
        │       └── throttle-scheduler.service.ts     # Tracks daily count, random delay calc
        ├── infrastructure/
        │   ├── persistence/typeorm/                  # Repos + migrations
        │   ├── llm/                                 # Crypto-news LLM config + prompt templates
        │   │   ├── crypto-news-llm.config.ts
        │   │   ├── prompt-template.ts                 # Built-in default
        │   │   └── crypto-news-llm.adapter.ts         # Implements shared/llm/llm.port.ts
        │   └── publishers/
        │       └── bot-api-crypto-news.publisher.ts   # Adapter for TelegramPublisherPort
        ├── api/
        │   └── http/
        │       ├── keywords.controller.ts
        │       └── queue.controller.ts
        └── crypto-news-publisher.module.ts
```

## Decisions

1. **Reuse `TelegramPublisherPort`** from `telegram/shared/` — don't recreate publisher infrastructure.
2. **Generic LLM in `shared/llm/`** — `LlmPort.generateText(prompt): Promise<string>`. `crypto-news-publisher/infrastructure/llm/` is crypto-specific.
3. **Persistence via TypeORM** — same pattern as `crypto-news` BC.
4. **Queue is a DB table** — survives restarts.
5. **Cron-based publisher** — runs every 30-60s, dequeues next article respecting daily cap and random delay.
6. **Daily cap reset at 04:00 UTC** (00:00 AST).
7. **FIFO with replace**: queue is ordered desc by `messageReceivedAt`. When full (36 items) and a new match arrives, the oldest UNPUBLISHED item is replaced (effectively: drop oldest, add newest at head).
8. **LLM call only at publish time** — store raw message in queue, generate text when publishing.
9. **Keyword model**: `Keyword` aggregate with `phrase: string, caseSensitive: boolean, enabled: boolean`. Matches against `message.content` (and optionally `title`).
10. **Config outside .env**: keywords DB-driven (via API). LLM provider/credentials via `.env` only (sensitive). Prompt template + target channel config via JSON (`apps/backend/config/crypto-news-publisher.config.json`).
11. **Single publisher (not parallel)**: only one Telegram publisher target. Configurable via config.

## Random delay

Between publications: random 3-15 minutes. Implemented as `Math.floor(3 + Math.random() * 12) * 60_000`.

## Daily cap & "replace oldest"

```sql
SELECT COUNT(*) FROM queue_entries
WHERE status = 'PUBLISHED' AND published_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC' - interval '4 hours');
-- 36 → at cap
```

When at cap AND new match arrives: delete oldest item with status='PENDING' (or 'SCHEDULED') to make room for new.
When at cap and queue is fully PUBLISHED today: skip (don't go over limit).

## Config files

`apps/backend/config/crypto-news-publisher.config.json`:

```json
{
  "targetChannelId": "@my_channel_or_id",
  "publishing": {
    "dailyCap": 36,
    "dailyResetUtcHour": 4,
    "randomDelayMs": { "min": 180000, "max": 900000 }
  },
  "prompt": {
    "model": "gpt-4o-mini",
    "template": "Reformula esta noticia crypto en español profesional: \"{{original}}\"\n\nImagen: {{hasImage}}\nLink: {{previewUrl}}\n\nGenera un post conciso (< 500 chars), en español, con un emoji relevante."
  },
  "enabled": false
}
```
