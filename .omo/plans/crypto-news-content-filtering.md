# crypto-news-content-filtering - Work Plan

## TL;DR (For humans)

**What you'll get:** Two independent but related features: (1) Configurable content filtering during crypto-news ingestion — remove unwanted patterns like "News | Markets | YouTube" from Cointelegraph messages using per-channel regex rules stored in the database. (2) HTML/Telegram entities to Markdown conversion at publish time — converts Telegram entities (bold, italic, links, code) and basic HTML to Telegram-compatible Markdown for clean Telegram publishing.

**Why this approach:** Filter at ingestion time to keep the database clean and avoid storing unwanted content; convert at publish time to preserve original content in the database while delivering clean Telegram-formatted messages. Both features are independent, configurable via DB/frontend, and require no S3/Spaces.

**What it will NOT do:** No full HTML parser (cheerio/jsdom) — uses Telegram entities only. No content modification at rest in DB (only at publish time). No changes to media pipeline, retention (72h/7d), or publisher queue logic. No shared media folder between staging/prod.

**Effort:** Medium
**Risk:** Low - features are isolated, use existing patterns, have fallbacks
**Decisions to sanity-check:** Filter timing (ingestion vs publish), regex vs simple string replace, per-channel vs global config, HTML→Markdown at publish vs ingest

Your next move: Approve this plan to proceed with implementation. Full execution detail follows below.

---

> TL;DR (machine): Medium, Low, Content filtering + HTML→Markdown conversion for crypto-news pipeline

---

## Scope

### Must have

- ContentFilterService with regex-based filtering at ingestion time (StoreNewsMessageUseCase)
- ChannelContentFilterConfig entity with regex patterns + replacement strings per channel
- CryptoNewsSource entity extended with filterConfig JSONB column
- MarkdownConverter service using Telegram entities + minimal HTML parsing
- ProcessNextQueuedArticleUseCase integration for HTML→Markdown at publish time
- Frontend CRUD for filter rules per channel
- Tests for filter service, markdown converter, and integration

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No full HTML parser (cheerio/jsdom) — use Telegram entities only
- No content modification at rest in DB (only at publish time)
- No changes to existing message storage format
- No changes to media download/HEVC pipeline
- No changes to media retention (72h) or publisher TTL (7d)
- No changes to existing message storage format
- No shared media folder between staging/prod
- No changes to publisher queue logic (dailyCap, throttle, etc.)

---

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD + tests-after (unit tests for new services, integration tests for pipeline)
- Evidence: .omo/evidence/task-<N>-crypto-news-content-filtering.<ext>
- Happy path: Filter matches → content cleaned; HTML→Markdown converts bold/italic/links/code
- Failure path: Invalid regex → logged, original content preserved; invalid HTML → fallback to plain text

---

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix

| Todo                                            | Depends on | Blocks | Can parallelize with |
| ----------------------------------------------- | ---------- | ------ | -------------------- |
| T1: FilterConfig entity + migration             | —          | T2, T4 | —                    |
| T2: ContentFilterService + tests                | T1         | T3, T6 | T4                   |
| T3: StoreNewsMessageUseCase integration         | T2         | T4     | —                    |
| T4: MarkdownConverter service + tests           | —          | T5     | T2                   |
| T5: ProcessNextQueuedArticleUseCase integration | T3, T4     | T6     | —                    |
| T6: Integration tests + frontend CRUD           | T3, T4, T5 | F1     | —                    |
| T7: Frontend CRUD for filter rules              | T1         | F1     | T5                   |

### Parallel execution waves

- Wave 1: T1 (FilterConfig entity + migration)
- Wave 2: T2 (ContentFilterService), T4 (MarkdownConverter) — parallel
- Wave 3: T3 (StoreNewsMessageUseCase integration), T5 (ProcessNextQueuedArticleUseCase integration) — parallel
- Wave 4: T6 (Integration tests), T7 (Frontend CRUD) — parallel
- Wave 5: F1-F4 (Final verification)

---

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Create ChannelContentFilterConfig entity + migration
     What to do: Add ChannelContentFilterConfig entity with fields: id, channelId (FK to CryptoNewsSource), pattern (regex string), replacement (string, default empty), flags (string, default 'gi'), isActive (boolean, default true), priority (int, default 0), createdAt (Date, default now). Create migration adding filterConfig JSONB column to crypto_news_source table. Add unique constraint (channelId, priority, createdAt) for deterministic ordering. Add check constraint on flags column: `flags ~ '^[gimsuy]+$'`.
     Must NOT do: Modify existing crypto_news_message table structure.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
     References: apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity.ts, apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity.ts
     Acceptance criteria: Migration runs successfully; ChannelContentFilterConfig entity exists with correct columns; filterConfig JSONB column added to crypto_news_source; unique constraint (channelId, priority, createdAt) created
     QA scenarios: happy: migration runs, entity works. failure: migration fails → fix. Evidence: .omo/evidence/task-1-crypto-news-content-filtering.log
     Commit: Y | feat(db): add ChannelContentFilterConfig entity + filterConfig column

- [ ] 2. ContentFilterService with regex filtering + tests (+ timeout protection)
     What to do: Create ContentFilterService with filterContent(content: string, filters: FilterRule[]): string method. Applies filters in priority order (lower priority first). Each filter: regex pattern + replacement + flags. Apply to both title and content. Handle invalid regex gracefully (log, skip). Add AbortController timeout (e.g., 100ms) per regex replace to prevent ReDoS. Unit tests for: exact match, regex with groups, case-insensitive, overlapping patterns, invalid regex (fallback to original), timeout protection.
     Must NOT do: Modify original content in DB; only filter at ingestion time.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3, 6
     References: apps/backend/src/telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case.ts:18-45
     Acceptance criteria: Service filters "News | Markets | YouTube" → ""; handles overlapping patterns; invalid regex logged + skipped; TTL=0 disables filter; timeout prevents ReDoS
     QA scenarios: happy: "News | Markets | YouTube" → ""; overlapping patterns work. failure: invalid regex logged + skipped; timeout triggers → fallback to original. Evidence: .omo/evidence/task-2-crypto-news-content-filtering.log
     Commit: Y | feat(ingestion): add ContentFilterService with regex filtering + timeout

- [ ] 3. Integrate ContentFilterService into StoreNewsMessageUseCase
     What to do: In StoreNewsMessageUseCase.execute(), after creating message but before saving, fetch filters for entry.channelId, apply to input.content and input.title. Save filtered content to message. Use CryptoNewsSourceRepository to fetch filters for channelId, ordered by (priority ASC, createdAt ASC) for deterministic tie-breaking.
     Must NOT do: Modify message content after save; only filter before save.
     Parallelization: Wave 3 | Blocked by: 2 | Blocks: 6
     References: apps/backend/src/telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case.ts:18-45
     Acceptance criteria: Cointelegraph message "News | Markets | YouTube: Bitcoin pumps" → "Bitcoin pumps"; filters loaded per channel ordered by priority then createdAt; disabled when no filters
     QA scenarios: happy: filter applied; no filters → original content. failure: DB error → log + continue. Evidence: .omo/evidence/task-3-crypto-news-content-filtering.log
     Commit: Y | feat(ingestion): integrate ContentFilterService into StoreNewsMessageUseCase

- [ ] 4. MarkdownConverter service + tests (with entities JSON validation)
     What to do: Create MarkdownConverter service with convertToMarkdown(content: string, entities?: TelegramEntity[]): string. Parse Telegram entities (bold, italic, code, link, pre) → Markdown (**bold**, _italic_, `code`, [text](url)). Handle basic HTML tags: <b>/<strong>→**, <i>/<em>→\*, <code>→`code`, <a>→[text](url), <pre>→```. Handle nested entities. Unit tests for: bold, italic, code, links, pre, nested, malformed HTML (fallback to text), overlapping entities. Parse `entry.formattingEntities` (JSON string) with try/catch JSON.parse; on parse failure, log warning and fallback to empty array.
     Must NOT do: Use cheerio/jsdom; no external HTML parser dependencies.
     Parallelization: Wave 2 | Blocked by: — | Blocks: 5
     References: apps/backend/src/telegram/ingestion/crypto-news/application/handlers/process-next-queued-article.use-case.ts
     Acceptance criteria: "<b>bold</b>" → "**bold\*\*"; "<a href='url'>link</a>" → "[link](url)"; nested preserved; malformed HTML → text fallback; malformed JSON entities → fallback to empty array
     QA scenarios: happy: all entity types convert; malformed HTML → text; malformed JSON entities → empty array. failure: malformed entities → fallback. Evidence: .omo/evidence/task-4-crypto-news-content-filtering.log
     Commit: Y | feat(publish): add MarkdownConverter for HTML/entities→Markdown

- [ ] 5. Integrate MarkdownConverter into ProcessNextQueuedArticleUseCase
     What to do: In ProcessNextQueuedArticleUseCase.execute(), after LLM generates content, pass content through MarkdownConverter before dispatchToTelegram. Pass Telegram entities from entry.formattingEntities (JSON string) to converter with try/catch JSON.parse; on parse failure, log warning and fallback to empty array.
     Must NOT do: Modify stored content in DB; only convert at publish time.
     Parallelization: Wave 3 | Blocked by: 3, 4 | Blocks: 6
     References: apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:1-150
     Acceptance criteria: LLM output with HTML/entities → clean Telegram Markdown; bold/italic/code/links preserved; malformed handled gracefully; malformed JSON entities → fallback to empty array
     QA scenarios: happy: HTML→Markdown; entities preserved. failure: malformed entities → fallback; malformed HTML → fallback. Evidence: .omo/evidence/task-5-crypto-news-content-filtering.log
     Commit: Y | feat(publish): integrate MarkdownConverter into ProcessNextQueuedArticleUseCase

- [ ] 6. Integration tests + E2E verification (including nested entities)
     What to do: Write integration test: Cointelegraph message with "News | Markets | YouTube" → filtered at ingestion → published as clean text with proper Markdown. Verify: filtered in DB, published with Markdown formatting, media still works. Test nested entities: `<b><i>bold italic</i></b>` → `**_bold italic_**`; malformed HTML fallback; malformed JSON entities → fallback to empty array.
     Must NOT do: Modify media pipeline, retention, or publisher queue logic.
     Parallelization: Wave 4 | Blocked by: 3, 4, 5 | Blocks: F1
     References: apps/backend/src/telegram/ingestion/crypto-news/, apps/backend/src/telegram/crypto-news-publisher/
     Acceptance criteria: Cointelegraph message "News | Markets | YouTube: BTC pumps" → DB has "BTC pumps" → published as "BTC pumps" with proper Markdown; nested entities `<b><i>text</i></b>` → `**_text_**`; malformed HTML → text fallback; malformed JSON entities → empty array
     QA scenarios: happy: filter + markdown work together; nested entities work. failure: partial failure → rollback. Evidence: .omo/evidence/task-6-crypto-news-content-filtering.log
     Commit: Y | test(integration): verify filter + markdown pipeline end-to-end

- [ ] 7. Frontend CRUD for filter rules
     What to do: Add FilterRules tab/page in crypto-news source management. CRUD for filter rules per channel: pattern (regex), replacement, flags, active, priority. Use existing crypto-news source management UI patterns.
     Must NOT do: Modify media pipeline, retention, or publisher queue logic.
     Parallelization: Wave 4 | Blocked by: 1 | Blocks: F1
     References: apps/frontend/src/pages/crypto-news/, apps/frontend/src/components/
     Acceptance criteria: UI shows filter rules per channel; CRUD works; priority ordering works
     QA scenarios: happy: add/edit/delete filters; priority respected. failure: invalid regex → form validation. Evidence: .omo/evidence/task-7-crypto-news-content-filtering.log
     Commit: Y | feat(frontend): add FilterRules CRUD for crypto-news sources

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify every todo has references + acceptance + QA + commit, each evidence file exists under .omo/evidence/crypto-news-content-filtering/
- [ ] F2. Code quality review — npm run lint + npm run test (backend/frontend) pass, Dockerfiles build, compose config valid
- [ ] F3. Real manual QA — agent runs deploy to staging, verifies: Cointelegraph message filtered, HEVC video plays, healthcheck passes, disk usage <80%
- [ ] F4. Scope fidelity — confirm Must NOT have held: no S3, no shared media, no quality loss >CRF 28, no .mp4 change, no queue logic changes

## Commit strategy

- One commit per todo (7 commits) + evidence capture; squash not required within wave but each todo commit is atomic and revertable
- Commit types: feat, test, docs as per todo; scope in parens matches file domain (ingestion, publish, config, frontend)
- Push per wave after green QA; draft rewritten after each wave with new baseline df before next wave

## Success criteria

- Huérfanos 14202→0, 26G→1G, df 89%→56%
- HEVC transcode 12G→5G, retention 48h→72h, publisher TTL 7d
- Deploy prod success, healthcheck OK, disk <80%, no "No space"
- Release Please 100% automatic, no manual intervention
- Cointelegraph "News | Markets | YouTube: BTC pumps" → DB "BTC pumps" → published as "BTC pumps" with Markdown
