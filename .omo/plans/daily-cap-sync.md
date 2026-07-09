# Make QueueController.dailyCap read from LlmConfig

## Problem
`QueueController` hardcodes `DAILY_PUBLISH_CAP = 36`. The frontend LlmConfig form can set dailyCap to any value, but the queue counts endpoint ignores it.

## Solution
Replace the static constant with the live value from `LlmConfigRepository.load()`.

## Todos

### 1. QueueController — use LlmConfig instead of hardcoded cap
- Inject `LlmConfigRepository` into the controller
- In `counts()`, call `this.llmConfigRepo.load()` to get the live dailyCap
- Remove `DAILY_PUBLISH_CAP` constant
- Use `cfg.dailyCap` instead of `QueueController.DAILY_PUBLISH_CAP` for the cap and remaining calculation
- `countPending` stays the same

## Verification
- `cd apps/backend && npx tsc --noEmit --incremental false` — 0 errors