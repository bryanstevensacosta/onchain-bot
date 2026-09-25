# apps/telegram-bots-gateway/ — NestJS Knowledge Base

> Verified 2026-09-25 against code. v0.1.0 (source of truth: `package.json`; todo 1 scaffold: setup + vault + resolver).
> Plan: `.omo/plans/telegram-bots-gateway.md` (todo 1). Decisions P42 in `.omo/drafts/mega-refactor-tramos.md` §7.6.

## OVERVIEW

NestJS 11 service (future Tramo, after market-data + dexter) that will be the SINGLE Bot API
coordination point: encrypted bot vault, global per-bot send rate-limit, single webhook ingress +
update router, per-bot health. Apps stop storing tokens. No MTProto here — Bot API only
(zero `AUTH_KEY_DUPLICATED` risk).

Built today (todo 1): Config (Tier-1) + `GET /api/health` + `VaultModule` (AES-256-GCM vault CRUD,
redacted reads, rotation without redeploy) + `BotsModule` (resolver `GET /api/bots/:id/profile`:
handle, bot id, username, cached avatar). Send gateway (todo 2) and ingress router (todo 3) are
NOT built — do not import them until their todos land.

## COMMANDS

```bash
# In apps/telegram-bots-gateway/
npm run dev                # nest start --watch (port BOTS_GATEWAY_PORT, default 4070)
npm run start:prod         # node dist/main (after build)
npm run build              # nest build
npm test                   # jest --forceExit --runInBand --testTimeout=30s (co-located *.spec.ts)
npm run test:cov           # jest --coverage → ./coverage
npm run lint               # eslint "{src,test}/**/*.ts" --fix

# Root alias (NOT yet wired — read-only outside this app in todo 1; add manually):
#   "dev:bots-gateway": "node scripts/cleanup-ports.mjs --force 4070 && npm run start:dev -w @onchain-bot/telegram-bots-gateway"
```

Verified live 2026-09-25: `node dist/src/main.js` + `curl -s localhost:4070/api/health` →
`{"status":"ok","components":{"vault":"up","resolver":"up"}}` (process stopped afterwards;
evidence `.omo/evidence/task-1-telegram-bots-gateway.log`).

## STRUCTURE

```text
src/
├── main.ts                       # bootstrap() — ValidationPipe whitelist/forbidNonWhitelisted/transform, listen BOTS_GATEWAY_PORT ?? 4070; no ENCRYPTION_KEY → clear stderr + exit 1, no listen
├── app.module.ts                 # Config (envFilePath ['.env.dev', '.env']) + HealthModule + VaultModule + BotsModule
├── health/
│   ├── health.module.ts
│   └── api/http/health.controller.ts (+ .spec.ts)   # GET /api/health → { status: 'ok', components }
├── vault/                        # BUILT (todo 1)
│   ├── vault.module.ts           # controller + VaultService + EncryptionService + InMemory repo; exports VaultService + EncryptionService
│   ├── domain/bot-vault.entity.ts (+ .spec.ts)      # BotVaultEntry: id/label/ciphertext/ownerApp/createdAt/rotatedAt; toRedacted() → token '***'
│   ├── application/vault.service.ts                 # register/list/get/rotate/remove (redacted) + decryptToken (internal-only)
│   ├── infrastructure/encryption.service.ts (+ .spec.ts)  # AES-256-GCM, ENCRYPTION_KEY hex64 direct else SHA-256, fail-closed
│   ├── infrastructure/in-memory-bot-vault.repository.ts  # upsert by id; TypeORM repo lands with todo 7
│   ├── infrastructure/bot-vault.orm-entity.ts       # `bot_vault` table shape (id, label, token=ciphertext, owner_app, created/rotated_at)
│   └── api/http/vault.controller.ts (+ .spec.ts)    # POST/GET/GET :id/PATCH :id/rotate/DELETE :id /api/vault/bots (internal)
├── bots/                         # BUILT (todo 1, resolver only)
│   ├── bots.module.ts            # imports VaultModule; controller + BotResolverService
│   ├── application/bot-resolver.service.ts           # getMe → profile; getUserProfilePhotos+getFile → permanent cache uploads/avatars/<id>.jpg
│   └── api/http/bots.controller.ts (+ .spec.ts)     # GET /api/bots/:id/profile + GET /api/bots/:id/avatar (404 when uncached)
├── shared/
│   ├── kernel/aggregate-root.ts, domain-error.ts
│   ├── config/app.config.ts (+ .spec.ts)            # Tier-1: ENCRYPTION_KEY + DATABASE_URL required; port BOTS_GATEWAY_PORT ?? 4070
│   ├── config/data-source.ts                        # own-DB data source (onchain_bot_bots[_staging]); migrations explicit
│   └── filters/domain-exception.filter.ts           # DomainError → HTTP status
Root: package.json (@onchain-bot/telegram-bots-gateway v0.1.0), nest-cli.json (deleteOutDir),
tsconfig{,.build}.json, jest.setup.ts, docker-compose.yml (postgres :5436, gateway :4070),
docker-compose.staging.yml (:4071), Dockerfile (CMD dist/main.js),
.env.example, .env.development, .env.staging.template, .env.production.template,
uploads/avatars/ (permanent cache, janitor-excluded — no janitor exists here)
```

## MODULES (app.module.ts — verified list)

Wired today: `ConfigModule` (global, `.env.dev` > `.env`, Tier-1 via `buildAppConfig()`) +
`HealthModule` (`GET /api/health`) + `VaultModule` (todo 1) + `BotsModule` (todo 1, resolver only).

Planned (per spec, NOT built — do not import until their todos land): send gateway
(`POST /api/bots/:id/send`, global per-bot rate-limit, todo 2), ingress webhook + router (todo 3).

## VAULT (todo 1)

`BotVaultEntry` (domain, in-memory today): `id` (uuid) + `label` + `encryptedToken` (AES-256-GCM
ciphertext `iv:tag:data` hex) + `ownerApp` (kol-system | feed-publisher | dexter-onchain-bot) +
`createdAt` + `rotatedAt` (null until first rotation). Table `bot_vault` mirrors it
(`token` column holds ciphertext; `owner_app`; TypeORM entity + migration land with todo 7).

`EncryptionService`: 64-hex `ENCRYPTION_KEY` direct, else SHA-256 (dev convenience); empty key →
fail-closed `DomainError`; tamper → `failed to decrypt payload`. Round-trip + tamper + empty-key
pinned by spec.

CRUD (`VaultService`, internal): callers pass PLAINTEXT, service encrypts before persist, returns
ONLY redacted projections (`token: '***'` — ciphertext never leaves the repo). Rotation =
ciphertext swap + `rotatedAt`, no redeploy. `decryptToken()` is internal-only (resolver + future
send gateway; never logged, never in responses).

## RESOLVER (todo 1)

`BotResolverService.resolveProfile(vaultId)`: decrypts the vault token → Bot API `getMe`
(handle = vault label, botId, username, displayName) → `getUserProfilePhotos` + `getFile` →
downloads the largest photo → permanent cache `uploads/avatars/<vaultId>.jpg` (no janitor in this
app — cache never expires). `GET /api/bots/:id/profile` returns
`{ id, handle, botId, username, displayName, avatarUrl }` (`avatarUrl` null when the bot has no
photo or the fetch fails; upstream errors surface as 502 WITHOUT the token). `GET
/api/bots/:id/avatar` serves the cached JPEG (1y cache) or 404 when uncached. Transport is global
`fetch` (10 s timeout, injectable `FETCH_FN` for tests — no axios here). No MTProto anywhere.

## ENV INVENTORY (`.env.example` — verified)

| Var                    | Value / default in example                     | Notes                                                        |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `BOTS_GATEWAY_PORT`    | `4070`                                         | dev default; staging `4071`, prod `4072`                     |
| `ENCRYPTION_KEY`       | (empty — `openssl rand -hex 32`, NEVER commit) | Tier-1 required, DISTINCT per env; empty → exit 1, no listen |
| `DATABASE_URL`         | `postgres://…@localhost:5432/onchain_bot_bots` | Tier-1 required; own logical DB                              |
| `DATABASE_SYNCHRONIZE` | `true`                                         | dev only; `false` in staging/prod templates                  |
| `AVATAR_DIR`           | `uploads/avatars`                              | permanent cache, janitor-excluded                            |

Templates (tracked, placeholders, NO secrets): `.env.development`, `.env.staging.template`,
`.env.production.template`. Real files (`.env.staging`, `.env.production`) gitignored, copied via
`scp` to OracleDroplet on deploy.

## PORTS

Spec triplet: **4070 / 4071 / 4072** (dev / staging / prod — plan §Decisions; verified free with
`lsof -i :4070`). Local `docker-compose.yml`: postgres `5436:5432` (db `onchain_bot_bots`),
gateway `4070:4070`. No clash with backend (`:3030`), ingestion (`:3031/32/33`), kol-system
(`:3050`), market-data (`:4000`), dexter (`:4060`). DB naming `onchain_bot_bots[_staging]`
(one-DB-per-app, same server per env).

## HEALTH

`GET /api/health` → 200 + `{ status: 'ok', components: { vault: 'up', resolver: 'up' } }`.
Per-component indicators (send/ingress) register here in todos 2–3.

## TS/ESLINT CONVENTIONS

- TypeScript 5.7 (verified `tsc --noEmit` clean), `strictNullChecks`, `noImplicitAny`,
  `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules` —
  mirroring `tsconfig.base.json` (`strict` NOT enabled globally). `nodenext` module/resolution.
- Path aliases (`tsconfig.json` + jest `moduleNameMapper`): `shared/*`, `vault/*`, `bots/*`,
  `health/*`, `src/*` rooted at `src/`. No `@/*` (frontend-only).
- Prettier: `singleQuote: true`, `trailingComma: "all"` (root config).
- NestJS: `deleteOutDir: true` in `nest-cli.json`; `process.noDeprecation = true` in `main.ts`.
- `ConfigModule.envFilePath: ['.env.dev', '.env']` — `.env.dev` wins.

## TESTS

```bash
npm test            # jest --forceExit --runInBand --testTimeout=30s
npm run test:cov    # → ./coverage
```

Co-located `*.spec.ts` (`testRegex: .*\.spec\.ts$`); no coverage thresholds. Failing-first:
6 suites written red (missing modules), then implemented green (19 tests). No MTProto in tests
(sessions live ONLY in ingestion-telegram; duplicates cause `AUTH_KEY_DUPLICATED`) — the resolver
spec injects a mocked `FETCH_FN`, never the real Bot API.

## GAPS

1. TypeORM persistence is scaffold-only (`bot-vault.orm-entity.ts` + `data-source.ts`, no
   migration, no wired repository): runtime uses the in-memory repo. Wire + migrate in todo 7
   (CI/deploy).
2. Root `npm run dev:bots-gateway` alias NOT added (todo 1 was read-only outside this app) — add
   the one-liner from §COMMANDS when touching root `package.json`.
3. No auth on vault/resolver endpoints yet (internal-only by convention): API-key guard lands with
   the send gateway (todo 2).

## STANDING RULE

Every future todo ends with: **"update AGENTS.md if anything changed"**. If commands, ports, envs,
modules, routes, or decisions moved, this file moves with them — same living-doc pattern as the
other `apps/*/AGENTS.md`.

## NOTES

- `.env.dev` takes precedence over `.env`.
- Never commit secrets (`.env`, `.env.staging`, `.env.production` gitignored; templates carry
  placeholders only).
- Dirty-worktree caution (2026-09-25): this branch carries uncommitted backend changes — commit
  ONLY `apps/telegram-bots-gateway/` in the todo-1 commit (`feat(telegram-bots-gateway): setup y
vault cifrado`).
- Conventional commits enforced by commitlint; never commit on `master`; `git reset --hard` /
  `revert --no-commit` forbidden without explicit approval.
