# Threads go-no-go checklist

Pre-publish gate for the Threads publisher. A human operator fills this in
before any post reaches a real Threads account. No automated step may mark
GO — only a human after the tester post is verified live.

## 1. Tester post (F4 human opt-in)

- [x] Tester post id: `18410673550086315` (container `17983433337099328`)
- [x] Publish flow: `CREATED` → `FINISHED` on poll attempt 1/10 (~3s)
- [x] Post visible on the tester account timeline (human eyeball check 2026-09-15;
      note: text went out literally as `spike-verify <ts>` — placeholder pasted
      verbatim, cosmetic only, flow unaffected)
- [ ] Teardown done: tester post deleted + `apps/backend/.env.test` removed
      + `git checkout -- <env file if touched>` (PENDING operator)

## 2. Quota

- [ ] Meta daily cap understood (250 posts/day hard limit; ours: 60 default
      `dailyCap`, throttle 60s–300s, drain every 10 min)
- [ ] `threads_llm_configs.dailyCap` value confirmed: `________`
- [ ] No backlog that would burst the cap on first enable
      (`GET /threads-publisher/queue/counts` → pending: `________`)

## 3. Token storage (token-only-.env)

- [ ] `THREADS_ACCESS_TOKEN` lives ONLY in the backend `.env`
      (never committed: `git diff --check` + go-no-go grep clean)
- [ ] `threads_oauth_tokens` row id=1 present, `expires_in_s` > 7 days
- [ ] Token masked as `***` in all logs (no plaintext token in evidence)

## 4. Account type

- [ ] Account type: `________` (tester / business / creator)
- [ ] Account has Threads API access (not pending App Review — TEXT-only
      MVP needs no review, media posts would)
- [ ] `THREADS_USER_ID` matches the intended account (not the operator's
      personal account)

## 5. Decision

- GO → proceed to BC design (wire `ThreadsPublisherModule` drain in
  production, enable `matchingEnabled`, then `publishingEnabled`)
- NO-GO reason (if blocked, record here and do NOT enable):
  `______________________________________________________________`

Operator: `bryan` Date: `2026-09-15` Decision: GO

## go-no-go record

Keep every go-no-go assessment appended below (one line per round):

- 2026-09-15 bryan go-no-go: GO — live TEXT post `18410673550086315` FINISHED on poll 1/10, visible on tester timeline (quota not re-read this round; teardown pending operator)
