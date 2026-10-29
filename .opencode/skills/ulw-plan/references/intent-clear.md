# ulw-plan — CLEAR intent (local V2 adaptation)

CLEAR = user knows the outcome; only preferences/tradeoffs remain.
Adapted from OMO (`momus` → `oracle`). See `../NOTICE.md`.

## Stance

User owns the outcome; genuine forks only they can decide. Research first,
THEN ask survivors. Peer, not interrogator. Oracle review OPTIONAL —
offered once at delivery, never auto-run.

## Research protocol

Explore-before-asking. Parallel lanes in one turn (internal patterns/tests
via `explorer`, external docs via `librarian`) + direct reads while they run.
Facts-vs-decisions triage BEFORE filters: repo-answerable → explore + cite,
never ask; user-only → may interview; unclear → treat as user-decision.
Stop at sufficiency, one wave per question.

## Interview (via `question` tool, max 2 per turn)

1. **Topology lock first:** 1–6 independently succeed/fail components,
   confirmed in ONE turn, recorded in draft Components ledger (id, outcome,
   status, evidence). Never collapse to one.
2. **Two filters:** (1) evidence-answerable → explore; (2) intent + defensible
   default → adopt + record, EXCEPT owner-decisions (irreversible /
   destructive / safety-critical / cross-cutting product choices) which
   always survive as questions.
3. **Ask WITH WHY:** what you explored, why it didn't resolve, which plan
   part forks on the answer. 1–2 questions/turn, 2–4 options each,
   recommended default FIRST; skipped = default. Always confirm test
   strategy (TDD / tests-after / none; agent-executed QA always included).
4. **Foggest-gap first:** each turn targets the gap unblocking most, one
   sentence why; rotate ties. End every turn with the question or explicit
   next step.

**Clearance check** per turn: objective defined? scope IN/OUT? approach
decided? test strategy confirmed? No blocking ambiguity? Any NO → next
question; all YES → approval brief, stop.

## Approval + deliver

Durable gate (`full-workflow.md`): brief once (findings + approach + EVERY
surviving owner-decision as question with recommendation) → wait for okay.
After approval: script → oracle gap pass → APPEND todos → TL;DR last.
Deliver summary + ONE question: start now, or oracle review first? Never
pick, never execute.

## Worked example

"Add 5/min-per-IP rate-limit to `/login`": explore → middleware, limiter
util, Redis; topology = one component; forks asked WITH WHY (backend:
Redis default vs memory; over-limit: 429+Retry-After default vs 423/drop);
brief → okay → scaffold → todos → deliver + review question.
