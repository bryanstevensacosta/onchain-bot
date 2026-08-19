# fix-telegram-urls-markdown - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** URLs in Telegram messages (both crypto-news and vip-calls) will appear as clickable links instead of plain text. This is done by converting raw URLs like `https://solscan.io/...` to Markdown format `[https://solscan.io/...](https://solscan.io/...)` before sending to Telegram.

**Why this approach:** The Telegram Bot API requires explicit Markdown/HTML formatting for clickable links. Setting `parse_mode: Markdown` alone is NOT enough — raw URLs remain as plain text. The solution is a simple regex-based converter applied at the publisher level, which is the most robust and maintainable approach.

**What it will NOT do:** It will NOT change the Telegram parse_mode from Markdown to HTML, and will NOT modify the LLM prompts — this would be less reliable than the programmatic fix.

**Effort:** Short
**Risk:** Low - pure string transformation, no external calls, test-covered
**Decisions to sanity-check:** None required - the approach is standard and proven

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Short, Low risk, adds formatUrlsAsMarkdown utility + applies to both crypto-news and vip-calls publishers

## Scope

### Must have

- Create a utility function `formatUrlsAsMarkdown(text)` that converts raw URLs to Markdown format
- Apply the fix to both crypto-news publisher (`BotApiCryptoNewsPublisherAdapter`) and vip-calls publisher (`VipCallsBotApiPublisherAdapter`)
- Add unit tests for the URL conversion utility
- Ensure backward compatibility - messages without URLs should pass through unchanged

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do NOT change parse_mode from Markdown to HTML
- Do NOT modify LLM prompts or add URL formatting instructions to the LLM
- Do NOT apply the fix to other adapters (chain-dexter-bot) unless explicitly needed
- Do NOT break existing functionality - URLs already in Markdown format should remain unchanged

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (backend has existing test infrastructure)
- Evidence: .omo/evidence/task-1-format-urls-utility.spec.ts (unit test for utility), .omo/evidence/task-3-publisher-tests.spec.ts (integration test)

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

Single wave for this small task (3 todos):

- Todo 1: Create utility function (standalone, no deps)
- Todo 2: Integrate into crypto-news publisher (depends on 1)
- Todo 3: Integrate into vip-calls publisher (depends on 1, can parallel with 2 after 1 completes)

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | -          | 2, 3   | -                    |
| 2    | 1          | -      | 3 (after 1)          |
| 3    | 1          | -      | 2 (after 1)          |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Create formatUrlsAsMarkdown utility function
     What to do: Create a new utility file `apps/backend/src/shared/common/utils/telegram-url-formatter.ts` with a pure function that converts raw URLs to Markdown format. The function should handle:
  - URLs starting with http:// or https://
  - Preserve URLs already in Markdown format `[text](url)`
  - Handle edge cases (URLs in code blocks, URLs with special characters)
    Must NOT do: Do NOT make HTTP calls or external requests
    Parallelization: Wave 1 | Blocked by: - | Blocks: 2, 3
    References: No existing URL formatter in codebase; Telegram Bot API docs confirm Markdown syntax requirement
    Acceptance criteria: `npm run test:backend -- --testPathPattern="telegram-url-formatter"` runs and passes
    QA scenarios:
  - Happy path: `formatUrlsAsMarkdown("Check https://solscan.io/token/ABC")` → `"Check [https://solscan.io/token/ABC](https://solscan.io/token/ABC)"`
  - Already formatted: `formatUrlsAsMarkdown("[Solscan](https://solscan.io)")` → unchanged
  - No URLs: `formatUrlsAsMarkdown("Just text")` → unchanged
  - Multiple URLs: `formatUrlsAsMarkdown("https://a.com and https://b.com")` → both converted
    Evidence: .omo/evidence/task-1-format-urls-utility.spec.ts
    Commit: Y | feat(shared): add formatUrlsAsMarkdown utility for Telegram link formatting

- [ ] 2. Integrate utility into crypto-news publisher
     What to do: Import and apply `formatUrlsAsMarkdown` to the text in `BotApiCryptoNewsPublisherAdapter` before sending. Apply to all send methods: sendMessage, sendPhoto (caption), sendVideo (caption), sendMediaGroup (caption).
     Must NOT do: Do NOT change parse_mode or any other API parameters
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: -
     References:
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:90-110` (sendMessage)
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:121-177` (sendPhoto)
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:179-236` (sendVideo)
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:238-325` (sendMediaGroup)
    Acceptance criteria: Build passes: `npm run build:backend` succeeds
    QA scenarios:
  - Test that a message with raw URL gets converted before send
  - Verify parse_mode: 'Markdown' is still set
    Evidence: .omo/evidence/task-2-crypto-news-integration.spec.ts
    Commit: Y | fix(crypto-news-publisher): convert raw URLs to Markdown format before sending to Telegram

- [ ] 3. Integrate utility into vip-calls publisher
     What to do: Import and apply `formatUrlsAsMarkdown` to the text in `VipCallsBotApiPublisherAdapter` before sending. Apply in `sendChunk` method which is used for all text sending.
     Must NOT do: Do NOT change parse_mode or any other API parameters
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: -
     References:
  - `apps/backend/src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts:237-277` (sendChunk)
    Acceptance criteria: Build passes: `npm run build:backend` succeeds
    QA scenarios:
  - Test that vip-call messages with raw URLs get converted
  - Verify the existing message formatter output is handled correctly
    Evidence: .omo/evidence/task-3-vip-calls-integration.spec.ts
    Commit: Y | fix(vip-calls-publisher): convert raw URLs to Markdown format before sending to Telegram

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit - Verify all 3 todos completed as specified
- [ ] F2. Code quality review - Run linter: `npm run lint:backend` passes
- [ ] F3. Real manual QA - Verify tests pass: `npm run test:backend -- --testPathPattern="telegram-url-formatter|crypto-news-publisher|vip-calls-publisher"`
- [ ] F4. Scope fidelity - Confirm no unintended changes to other files

## Commit strategy

All 3 todos will be committed together in a single commit for atomicity:

- Commit message: `fix(telegram): convert raw URLs to Markdown format for clickable links`
- The commit will include the utility function + both publisher integrations + tests

## Success criteria

1. Unit tests for `formatUrlsAsMarkdown` pass (at least 4 test cases: basic, already formatted, no URLs, multiple URLs)
2. Backend builds successfully: `npm run build:backend`
3. Linting passes: `npm run lint:backend`
4. Existing publisher tests still pass: `npm run test:backend -- --testPathPattern="bot-api.*spec"`
5. URLs in Telegram messages appear as clickable links (verified manually in staging after deploy)
