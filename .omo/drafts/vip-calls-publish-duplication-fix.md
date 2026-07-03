---
slug: vip-calls-publish-duplication-fix
status: ready
intent: clear
pending-action: execute tasks in .omo/plans/vip-calls-publish-duplication-fix.md
approach: Three waves: (1) structured correlation-id logging + repro, (2) replace save-with-publish with tryReserve+finalize (RESERVED status) atomic flow + fail-closed handler + UNIQUE INDEX + reconciliation job for stuck RESERVED rows, (3) consolidate logs via nestjs-pino + pino-roll under apps/backend/logs/. NO publish-then-delete — adopted Opción C after user pushback on production-grade deleteMessage semantics.
---
