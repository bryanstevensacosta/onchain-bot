---
slug: threads-meta-test-spike
status: drafting
intent: unclear
pending-action: write .omo/plans/threads-meta-test-spike.md
approach: validación trivial en 3 niveles (curl manual → spike aislado en threads-meta-test/ → publisher completo diferido); usuario aprobó plan paso a paso con spike mínimo
---

# Draft: threads-meta-test-spike

## Components (topology ledger)
| id | outcome | status | evidence |
| C1 scaffold aislado | threads-meta-test/ con README + .env.example + scripts, sin tocar apps/* | active | root package.json:7-9 workspaces apps/*; .gitignore:1-12 env rules |
| C2 auth OAuth | authorize URL + exchange code→short→long + refresh documentados y scripteados | active | https://developers.facebook.com/docs/threads/get-started/ (30-jun-2026), /get-started/long-lived-tokens/ |
| C3 publish TEXT | 2-step container→publish + quota check, solo texto 500 chars | active | https://developers.facebook.com/docs/threads/posts/ ; overview 22-dic-2025 (250/24h, >5 links reject) |
| C4 runbook go/no-go | guía paso a paso Meta App → tester → primer post → decisión publisher real | active | use-case https://developers.facebook.com/docs/development/create-an-app/threads-use-case/ |
| C5 publisher real | NUEVO BC threads-publisher clonando crypto-news-publisher | deferred | apps/backend/src/telegram/crypto-news-publisher/application/scheduling/publisher-cron.scheduler.ts:69-98 |

## Open assumptions (announced defaults)
| assumption | default | rationale | reversible? |
| Dónde probar | threads-meta-test/ en raíz, fuera de workspaces apps/*, Node 22+ .mjs sin deps | usuario lo pidió; evita contaminar backend/monorepo | sí (se borra) |
| Alcance media | solo TEXT plano primero | media exige hosting público; fricción mínima | sí |
| Secretos | .env local gitignored + .env.example trackeado; tokens NUNCA en git | .gitignore ya ignora .env*; evita leak | sí |
| Cuenta | pública recomendada (grant 90d auto-extiende con refresh) | privadas exigen re-auth 90d | sí (cambiar cuenta) |
| QA sin token | scripts con DRY_RUN + MOCK + node --check; post real lo hace el humano con runbook | agent no tiene token; verificación agent-ejecutable sin red | sí |
| Publisher real | diferido; solo decisión go/no-go al final | pide "antes de implementarlo realmente" | sí |

## Findings (cited - path:lines)
- Publishers actuales: vip-channel síncrono (vip-calls-publish.use-case.ts:107-168, adapter 60s rate) vs crypto-news-publisher encolado+cron (publisher-cron.scheduler.ts:69-98 lock 7421371, process-next-queued-article.use-case.ts:83-176). Template futuro = crypto-news. (explore ses_f5bfe6004ffe5)
- Threads: Meta App + Threads Use Case, usar Threads App ID; scopes threads_basic+threads_content_publish; OAuth threads.net/oauth/authorize → POST graph.threads.net/oauth/access_token (1h) → GET access_token?grant_type=th_exchange_token (60d) → GET refresh_access_token (≥24h). (librarian ses_f5bfe5fffffe24)
- Publish TEXT 2-step: POST /{uid}/threads {media_type=TEXT,text} → POST /{uid}/threads_publish {creation_id}, espera ~30s, host graph.threads.net/v1.0.
- Test sin review: App roles → Threads Tester → acepta invite → funciona inmediato; review solo para público. Costo $0.
- Límites: 250 posts/24h, 500 chars, >5 links LINK_EXCEEDED, quota endpoint threads_publishing_limit.
- Root: workspaces apps/* (package.json:7-9), sin "type": "module" → usar .mjs ESM; .env* gitignored (.gitignore:1-12); Node 22+.

## Decisions (with rationale)
- Spike aislado en threads-meta-test/, 0 deps, fetch nativo + .mjs → fricción mínima, borrable.
- 4 scripts: auth-url.mjs (construye authorize URL) + exchange.mjs (code→short→long + refresh) + publish.mjs (container→publish TEXT) + quota.mjs (chequeo límite). Cada uno con --dry-run y --mock para QA sin token.
- README runbook paso a paso (crear app → tester → token Explorer → curl → scripts → primer post → go/no-go).
- Publisher real (BC NestJS) explícitamente OUT; solo se deja decisión documentada.

## Scope IN
- threads-meta-test/{README.md,.env.example,.gitignore,auth-url.mjs,exchange.mjs,publish.mjs,quota.mjs}
- Runbook + troubleshooting (token expirado, perfil privado 90d, LINK_EXCEEDED, espera 30s container) + plantilla decisión go/no-go.

## Scope OUT (Must NOT have)
- NO tocar apps/backend, apps/frontend, apps/ingestion-telegram, package.json workspaces, ni crear BC/modulo NestJS.
- NO commitear tokens/secretos (.env real); NO App Review; NO media/imagen/carrusel; NO auto-refresh cron; NO publicar en cuenta productiva sin confirmación.
- NO dependencias npm nuevas.

## Open questions
- Ninguna bloqueante; solo falta que el humano cree la Meta App y aporte THREADS_APP_ID/SECRET + cuenta tester (paso del runbook).

## Approval gate
status: approved 2026-09-15 — usuario pidió "prepara el plan para guiarme paso a paso ... en threads-meta-test/ ... con spike mínimo".
pending-action done → generar plan .omo/plans/threads-meta-test-spike.md (Classify: Trivial → Metis 1×, Momus suprimido por cost guard).
