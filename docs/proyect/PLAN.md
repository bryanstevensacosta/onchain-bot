# Architecture Plan & Implementation Order

## Overall Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     CA DISCOVERY PIPELINE                              │
│                                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│   │  REDDIT  │  │ TELEGRAM │  │ TWITTER  │  │  ...     │  ← Ingestion     │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
│        │             │             │             │                       │
│        └─────────────┴─────────────┴─────────────┘                       │
│                          ↓                                              │
│                   ┌─────────────────┐                                   │
│                   │   EXTRACTION    │  CA / Symbol / URL extraction     │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │   PARSING       │  Normalize raw text into structured│
│                   └────────┬────────┘  candidates                        │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │   NORMALIZATION │  Trim, validate, dedupe           │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │CHAIN DETECTION  │  EVM / Solana / Sui / Aptos        │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │  ENRICHMENT     │  DexScreener, GeckoTerminal, etc │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │ CLASSIFICATION  │  Token / Pool / NFT / Scam       │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │    SCORING      │  Risk + signal scoring            │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │    FILTERS      │  Honeypot reject, LP checks      │
│                   └────────┬────────┘                                   │
│                            ↓                                            │
│                   ┌─────────────────┐                                   │
│                   │   PUBLISHING     │  Telegram channel, API, alerts   │
│                   └─────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
src/
├── shared/                          # ✅ DONE - DDD base classes, config
│
├── ca/                              # ← CA Discovery Pipeline (all sub-BCs)
│   │
│   ├── ingestion/                   # Sources of messages (BC: each source)
│   │   ├── telegram/                 # ← FIRST BC to implement
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   ├── telegram-channel.entity.ts
│   │   │   │   │   └── telegram-message.entity.ts
│   │   │   │   ├── value-objects/
│   │   │   │   │   ├── channel-id.vo.ts
│   │   │   │   │   └── message-id.vo.ts
│   │   │   │   ├── events/
│   │   │   │   │   └── message-ingested.event.ts
│   │   │   │   └── ports/
│   │   │   │       └── telegram-listener.port.ts
│   │   │   ├── application/
│   │   │   │   ├── commands/
│   │   │   │   │   ├── backfill-channel.command.ts
│   │   │   │   │   └── start-listening.command.ts
│   │   │   │   └── dto/
│   │   │   │       └── raw-message.dto.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── client/
│   │   │   │   │   └── telegram-mtproto.client.ts
│   │   │   │   ├── api/
│   │   │   │   │   └── ingestion-status.controller.ts
│   │   │   │   └── mappers/
│   │   │   │       └── message.mapper.ts
│   │   │   └── telegram-ingestion.module.ts
│   │   │
│   │   ├── reddit/                  # Future BC
│   │   ├── twitter/                  # Future BC
│   │   ├── discord/                  # Future BC
│   │   └── webhooks/                 # Future BC
│   │
│   ├── extraction/                  # Pull addresses/symbols from messages
│   ├── parsing/                     # Structure extraction
│   ├── normalization/               # Dedupe, validate
│   ├── chain-detection/             # EVM/Solana/Sui/Aptos inference
│   ├── enrichment/                  # DexScreener, GeckoTerminal, Birdeye
│   ├── classification/              # Token/Pool/NFT/Scam detection
│   ├── scoring/                     # Risk + signal scoring
│   ├── filters/                     # Honeypot reject, filters
│   └── publishing/                  # Telegram output channels, alerts
│
├── user/                            # User BC (later)
├── token/                           # Token data BC (later)
├── trading/                         # Trading BC (later)
├── analytics/                       # Risk BC (later)
└── notification/                    # Notification BC (later)
```

## Implementation Order

| # | BC | Purpose | Depends On |
|---|----|---------|------|
| 1 | `ca/ingestion/telegram` | Telegram channel listener (MTProto) | shared/ |
| 2 | `ca/extraction` | Extract CAs, symbols, URLs from text | (pure, no deps) |
| 3 | `ca/parsing` | Parse structured fields (token name, MC, etc.) | extraction |
| 4 | `ca/normalization` | Dedupe by (chain, address); validate | parsing, extraction |
| 5 | `ca/chain-detection` | Identify chain via regex/Base58/RPC | shared/ |
| 6 | `ca/enrichment` | Fetch market data (DexScreener, GeckoTerminal, Birdeye) | chain-detection |
| 7 | `ca/classification` | Token / Pool / NFT / Scam | enrichment |
| 8 | `ca/scoring` | Risk + signal scoring | classification |
| 9 | `ca/filters` | Honeypot reject, min liquidity | scoring |
| 10 | `ca/publishing` | Output to Telegram channels | filters |
| 11 | `ca/ingestion/reddit` | Add Reddit as additional source | extraction |
| 12 | `ca/ingestion/twitter` | Add Twitter/X as source | extraction |

## Why Telegram First?

- Highest signal density (crypto alpha channels)
- Most CAs posted (vs Twitter noise)
- Best MTProto tooling for Node (GramJS)
- Historical backfill available

## Future BCs (After CA Pipeline)

- `user/` — Telegram bot users (interact with bot)
- `token/` — Token data cache
- `analytics/` — Risk analysis
- `notification/` — Multi-channel notifications

## Implementation Status

- [x] NestJS + TypeScript scaffold
- [x] `shared/` (DDD base classes, config)
- [x] **`ca/ingestion/telegram`** ← NEXT
- [x] **`ca/extraction`** ← DONE
- [x] **`ca/parsing`** ← DONE
- [x] **`ca/normalization`** ← DONE
- [x] **`ca/chain-detection`** ← DONE
- [x] **`ca/enrichment`** ← DONE
- [x] **`ca/classification`** ← DONE
- [x] **`ca/scoring`** ← DONE
- [x] **`ca/filters`** ← DONE
- [x] **`ca/publishing/telegram`** ← DONE
- [ ] Future: Reddit/Twitter ingestion sources, LLM parsing fallback, real MTProto sender, honeypot BC
