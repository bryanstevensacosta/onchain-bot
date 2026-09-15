# threads-meta-test-spike - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una carpeta separada de pruebas con 4 mini-herramientas y una guía que te lleva de crear la app de Meta a publicar tu primer post de texto en Threads, para saber si vale la pena integrarlo al proyecto.

**Why this approach:** Probar fuera del proyecto evita romper nada y cuesta minutos; si el post de prueba funciona, ya sabemos que la API sirve y después diseñamos la integración real copiando el publicador de noticias que ya tienes.

**What it will NOT do:** No tocará tu backend ni tu dashboard, no instalará nada nuevo, no guardará contraseñas en git, y no intentará fotos, videos ni automatizar nada todavía — solo texto de prueba.

**Effort:** Quick
**Risk:** Low - carpeta aislada y borrable, sin tocar producción
**Decisions I made for you:** Probar solo texto plano primero porque las fotos exigen servidor público; guardar el token solo en tu máquina y nunca en git; usar cuenta pública para que el permiso dure 90 días; dejar la integración completa para después de que el post de prueba funcione. Si alguna no te gusta, dime y la cambio.

Your next move: aprueba y lo ejecutamos con `$start-work`, o dime qué ajustar. Full execution detail follows below.

---

> TL;DR (machine): Quick/Low — isolated Threads TEXT spike (4 scripts + runbook + go/no-go), zero app changes, zero deps.

## Scope
### Must have
- Carpeta aislada `threads-meta-test/` en raíz: `README.md`, `.env.example`, `lib/env.mjs`, `auth-url.mjs`, `exchange.mjs`, `publish.mjs`, `quota.mjs`. Cero deps, solo `fetch` nativo (Node ≥18, probado 22.22.3), ESM `import` only, patrón `scripts/cleanup-ports.mjs`.
- Contrato CLI+env congelado: todos leen `threads-meta-test/.env` (helper `readEnv`, nunca root `.env`); `THREADS_APP_ID, THREADS_APP_SECRET, THREADS_REDIRECT_URI, THREADS_SCOPES=threads_basic,threads_content_publish, THREADS_AUTH_CODE, THREADS_ACCESS_TOKEN, APP_MODE`.
- `auth-url.mjs`: construye `https://threads.net/oauth/authorize?client_id=&redirect_uri=&scope=&response_type=code` + `--dry-run` (imprime URL, cero fetch).
- `exchange.mjs`: `code→short` (POST `graph.threads.net/oauth/access_token`) + `short→long` (`grant_type=th_exchange_token`) + nota refresh (`th_refresh_token`, ≥24h); `--mock` con fixture; nunca sobrescribe `.env`, solo imprime.
- `publish.mjs`: valida `text.length ≤500` (rechaza 501 con `TEXT_TOO_LONG`), 2-step `POST /{uid}/threads {media_type=TEXT}` → poll `3s × 10 tries` con `AbortSignal.timeout(10000)` → `POST /{uid}/threads_publish`; `--dry-run` (cero fetch, imprime payload + `DRY-RUN`), `--mock` (fixture `IN_PROGRESS×2 → FINISHED`), `--mock=never-finishes` → exit 2.
- `quota.mjs`: GET read-only de `threads_publishing_limit` (imprime `used/250`), `--mock` imprime `used: 3/250`; sin estado local, sin DB.
- `README.md` runbook paso a paso: crear Meta App (Threads Use Case, Threads App ID) → Threads Tester → `redirect_uri`/scopes → token vía Explorer → cada script + salida esperada → límites (500/250, >5 links) → expiración/revoke → troubleshooting (`redirect_uri_mismatch`, código inválido, container ERROR) → teardown (`rm .env`) → plantilla decisión go/no-go publisher real.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO tocar `apps/*`, `package.json`, workspaces, `*.template`, `infra/*`; NO `npm install` ni nuevas deps (`dotenv`, `node-fetch`, `axios` prohibidos); NO `require()`/`__dirname`/`module.exports`.
- NO llamadas reales a `graph.threads.net` en QA agent (`--dry-run`/`--mock` obligatorio; token `FAKE`); NO `console.log` de tokens ni headers; NO commitear `.env` real; `.env.example` solo placeholders (`PASTE_ME`, sin secretos 32+ chars).
- NO App Review, NO media/imagen/carrusel/GIF, NO auto-refresh cron, NO contador local de cuota, NO publicar en cuenta productiva, NO truncar texto 501 en silencio (rechazar).

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: **none** (spike throwaway, sin framework) + agent-executed QA por script: `node --check` (sintaxis) + `--dry-run`/`--mock` (conducta) + `git check-ignore`/`git status --porcelain` (fuga/alcance) + `grep` (contratos ESM/sin-secretos). El post real lo hace el humano con el runbook y queda FUERA de los todos agent.
- Evidence: `.omo/evidence/task-<N>-threads-meta-test-spike.<ext>` (stdout + exit codes; esa carpeta está gitignored por diseño, no se commitea).
- Red-ban: con `THREADS_ACCESS_TOKEN=FAKE` o flags `--dry-run`/`--mock`, `fetch('https://graph.threads.net*')` PROHIBIDO; allowlist: solo `--mock` usa fixture local/`http://127.0.0.1:9`, nunca `graph.*`.

## Execution strategy
### Parallel execution waves
- Wave 1 (scaffold): todo 1 crea carpeta + `lib/env.mjs` + `.env.example` + prueba `git check-ignore`. Solo 1 todo porque es prerrequisito físico de los demás (spike Trivial: sub-split intencional, cada script posterior es 1 fichero atómico).
- Wave 2 (scripts, 4 en paralelo): todos 2-5, cada uno 1 fichero + su QA `--dry-run`/`--mock`; bloqueados por todo 1, paralelizables entre sí.
- Wave 3 (runbook final): todo 6 cierra README + prueba global de fuga/alcance. Final verification wave F1-F4 en paralelo tras todos.
### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| 1 scaffold+env | — | 2,3,4,5,6 | — |
| 2 auth-url | 1 | 6 | 3,4,5 |
| 3 exchange | 1 | 6 | 2,4,5 |
| 4 publish | 1 | 6 | 2,3,5 |
| 5 quota | 1 | 6 | 2,3,4 |
| 6 README runbook | 1-5 | F1-F4 | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Scaffold threads-meta-test/ + lib/env.mjs + .env.example + gitignore proof
  What to do / Must NOT do: Crear `threads-meta-test/`, `threads-meta-test/lib/env.mjs` (helper `readEnv(path)` ~15 líneas: fs.readFileSync, split `KEY=VALUE`, ignora `#`/vacíos, trim comillas; export ESM), `threads-meta-test/.env.example` (7 claves con `PASTE_ME`, scopes fijos `threads_basic,threads_content_publish`), sin `.env` real (solo prueba con `git check-ignore`). MUST NOT: tocar `apps/*`, `package.json`, `npm install`, `require()`/`__dirname`, escribir fuera de `threads-meta-test/`.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2,3,4,5,6
  References (executor has NO interview context - be exhaustive): root `package.json:1-44` (sin `type:module` → `.mjs` + `import` obligatorio; workspaces `apps/*` → spike fuera de workspaces); `.gitignore:1-12` (`.env` ignorado por basename, `!.env.example` permitido); patrón ESM `scripts/cleanup-ports.mjs`; docs `https://developers.facebook.com/docs/threads/get-started/` (scopes); draft `.omo/drafts/threads-meta-test-spike.md` (contrato env).
  Acceptance criteria (agent-executable): `node --check threads-meta-test/lib/env.mjs` → exit 0; `git check-ignore -v threads-meta-test/.env` → match `.gitignore`; `diff <(grep -oE '^[A-Z_]+' threads-meta-test/.env.example | sort) <(grep -ohE 'THREADS_[A-Z_]+|APP_MODE' threads-meta-test/lib/env.mjs threads-meta-test/.env.example | sort -u)` coherente (claves `.env.example` ⊇ usadas).
  QA scenarios (name the exact tool + invocation): happy: `node -e "import('./threads-meta-test/lib/env.mjs').then(m=>console.log(typeof m.readEnv))"` → `function`, Evidence `.omo/evidence/task-1-threads-meta-test-spike.txt`. failure: `grep -rn "require(\|__dirname\|dotenv\|node-fetch\|axios" threads-meta-test/ || echo CLEAN` → `CLEAN`; `grep -riE 'eyJ|THAA[A-Za-z0-9_-]{10,}' threads-meta-test/.env.example || echo NO-SECRETS` → `NO-SECRETS`.
  Commit: Y | chore(threads-spike): scaffold threads-meta-test + env helper
- [x] 2. auth-url.mjs (authorize URL builder + --dry-run)
  What to do / Must NOT do: Crear `threads-meta-test/auth-url.mjs`: lee `.env` vía `lib/env.mjs`, construye `https://threads.net/oauth/authorize?client_id=<APP_ID>&redirect_uri=<URI>&scope=threads_basic,threads_content_publish&response_type=code` (+ `state` opcional), flag `--dry-run` (default: imprime URL, cero fetch), `--help`. MUST NOT: `fetch` real, logear `APP_SECRET`, `require()`, deps.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 6 | Can parallelize with: 3,4,5
  References: `threads-meta-test/lib/env.mjs` (todo 1); docs authorize `https://developers.facebook.com/docs/threads/get-started/`; Node global `fetch` (no importar); `import.meta.url` para rutas si hace falta.
  Acceptance criteria: `node --check threads-meta-test/auth-url.mjs` → exit 0; `node threads-meta-test/auth-url.mjs --dry-run | grep -q 'threads.net/oauth/authorize.*response_type=code'` → exit 0; con `THREADS_ACCESS_TOKEN=FAKE` no hay fetch (cero red).
  QA scenarios: happy: `node threads-meta-test/auth-url.mjs --dry-run` contiene `client_id=` + `scope=threads_basic`, Evidence `.omo/evidence/task-2-threads-meta-test-spike.txt`. failure: `THREADS_APP_ID= node threads-meta-test/auth-url.mjs --dry-run` → exit 1 con `MISSING THREADS_APP_ID`; `grep -n "fetch(" threads-meta-test/auth-url.mjs || echo NO-FETCH` → `NO-FETCH`.
  Commit: Y | feat(threads-spike): auth-url builder con dry-run
- [x] 3. exchange.mjs (code→short→long + refresh nota, --mock)
  What to do / Must NOT do: Crear `threads-meta-test/exchange.mjs`: `--code <CODE>` → `POST https://graph.threads.net/oauth/access_token {client_id,client_secret,code,grant_type=authorization_code,redirect_uri}` → imprime short + `user_id` → `GET .../access_token?grant_type=th_exchange_token` → imprime long + `expires_in` + nota refresh (`th_refresh_token`, solo si ≥24h, grant público 90d); `--mock` usa fixture (sin red, no sobrescribe `.env`); `--help`. MUST NOT: persistir/escribir `.env`, logear `client_secret`/tokens completos (enmascarar `***`), red en `--mock`/`FAKE`.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 6 | Can parallelize with: 2,4,5
  References: `threads-meta-test/lib/env.mjs`; docs `https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/`; `AbortSignal.timeout(10000)` por fetch.
  Acceptance criteria: `node --check threads-meta-test/exchange.mjs` → exit 0; `node threads-meta-test/exchange.mjs --code FAKE --mock | grep -q 'expires_in'` → exit 0, cero fetch a `graph.*`.
  QA scenarios: happy: `--mock` imprime pasos `short→long` + `user_id`, Evidence `.omo/evidence/task-3-threads-meta-test-spike.txt`. failure: sin `--code` → exit 1 `MISSING --code`; `grep -n "writeFile\|appendFile" threads-meta-test/exchange.mjs || echo NO-WRITE` → `NO-WRITE` (no persiste `.env`).
  Commit: Y | feat(threads-spike): token exchange code-short-long con mock
- [x] 4. publish.mjs (TEXT 2-step + poll 3s×10 + 500-char guard)
  What to do / Must NOT do: Crear `threads-meta-test/publish.mjs`: args `--text "..."` + `--dry-run`/`--mock`/`--mock=never-finishes`; valida `text.length ≤500` (501 → exit 1 `TEXT_TOO_LONG len=501`); `--dry-run`: imprime `DRY-RUN` + payloads, cero fetch; real: `POST /{uid}/threads {media_type=TEXT,text}` → poll `3s × 10` (`AbortSignal.timeout(10000)`) hasta `FINISHED` → `POST /{uid}/threads_publish {creation_id}`; timeout → exit 2 con container id; `--mock`: fixture `IN_PROGRESS×2 → FINISHED` + ids fake. MUST NOT: truncar en silencio, fetch real con `FAKE`/`--dry-run`/`--mock`, logear token.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 6 | Can parallelize with: 2,3,5
  References: `threads-meta-test/lib/env.mjs`; docs `https://developers.facebook.com/docs/threads/posts/` (2-step, espera ~30s, 500 chars), overview 22-dic-2025 (250/24h, `LINK_EXCEEDED` >5 links).
  Acceptance criteria: `node --check threads-meta-test/publish.mjs` → exit 0; `THREADS_ACCESS_TOKEN=FAKE node threads-meta-test/publish.mjs --text "spike" --dry-run | grep -q DRY-RUN` → exit 0; `node threads-meta-test/publish.mjs --text "spike" --mock | grep -q FINISHED` → exit 0.
  QA scenarios: happy: `--mock` muestra secuencia `container + publish` + `status==FINISHED`, Evidence `.omo/evidence/task-4-threads-meta-test-spike.txt`. failure: `--dry-run --text "$(python3 -c 'print("x"*501)')"` → exit 1 `TEXT_TOO_LONG`; `--mock=never-finishes` → exit 2 con container id.
  Commit: Y | feat(threads-spike): publish TEXT 2-step con poll y guard 500
- [x] 5. quota.mjs (read-only threads_publishing_limit + --mock)
  What to do / Must NOT do: Crear `threads-meta-test/quota.mjs`: `GET /{uid}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config`, imprime `used/250` + `resets_at`; `--mock` imprime `used: 3/250` sin red; `--help`; sin escritura de estado (sin DB/fichero contador). MUST NOT: persistir estado, fetch real en `--mock`/`FAKE`.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 6 | Can parallelize with: 2,3,4
  References: `threads-meta-test/lib/env.mjs`; docs overview `https://developers.facebook.com/documentation/threads/overview` (quotas 250/1000/100, `4800×impressions`).
  Acceptance criteria: `node --check threads-meta-test/quota.mjs` → exit 0; `node threads-meta-test/quota.mjs --mock | grep -q '/250'` → exit 0.
  QA scenarios: happy: `--mock` imprime `used: 3/250`, Evidence `.omo/evidence/task-5-threads-meta-test-spike.txt`. failure: `grep -n "writeFile\|appendFile\|openSync.*w" threads-meta-test/quota.mjs || echo STATELESS` → `STATELESS`; con token `FAKE` sin `--mock` → exit 1 `REFUSE FAKE TOKEN` (no red).
  Commit: Y | feat(threads-spike): quota check read-only con mock
- [x] 6. README runbook paso a paso + go/no-go + prueba global fuga/alcance
  What to do / Must NOT do: Escribir `threads-meta-test/README.md` (≥6 `##`: Prereqs humano, Setup `.env`, cada script + salida esperada verbatim de `--help`, Límites 500/250, Expiración token + revoke, Troubleshooting `redirect_uri_mismatch`/código inválido/container ERROR/`429`, Teardown `rm .env`, Decisión go/no-go publisher real con plantilla). Cerrar con pruebas globales. MUST NOT: incluir secretos, rutas fuera de `threads-meta-test/`, prometer publisher real.
  Parallelization: Wave 3 (final) | Blocked by: 1,2,3,4,5 | Blocks: F1-F4
  References: todos 1-5 (salidas `--help` reales); docs hub `https://developers.facebook.com/docs/threads`, changelog `https://developers.facebook.com/docs/threads/changelog/`, use-case `https://developers.facebook.com/docs/development/create-an-app/threads-use-case/`; draft `.omo/drafts/threads-meta-test-spike.md`.
  Acceptance criteria: `grep -c '^## ' threads-meta-test/README.md` ≥ 6; `git check-ignore -v threads-meta-test/.env` → match; `git status --porcelain | grep -v '^?? threads-meta-test/' || echo ONLY-SPIKE` + `git diff --name-only | grep -v '^threads-meta-test/' || echo NO-TOUCH` → solo spike; `node --check` de los 5 `.mjs` → exit 0.
  QA scenarios: happy: `for f in auth-url exchange publish quota; do node threads-meta-test/$f.mjs --help | grep -q Usage; done` → exit 0, Evidence `.omo/evidence/task-6-threads-meta-test-spike.txt`. failure: `grep -riE 'eyJ|THAA[A-Za-z0-9_-]{10,}|BEGIN .*PRIVATE' threads-meta-test/ || echo NO-SECRETS` → `NO-SECRETS`; `node threads-meta-test/publish.mjs --dry-run --text "$(python3 -c 'print("x"*501)')"` → exit 1 (guard documentado en README).
  Commit: Y | docs(threads-spike): runbook + go-no-go y prueba global

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit — `git status --porcelain` solo `threads-meta-test/`; `git diff --name-only | grep -v '^threads-meta-test/'` vacío; 5 `.mjs` + README + `.env.example` existen, cero ficheros fuera.
- [x] F2. Code quality review — `node --check` ×5 exit 0; `grep -rn "require(\|__dirname\|node-fetch\|axios\|dotenv" threads-meta-test/` vacío; `import` only + `fetch` nativo + `AbortSignal.timeout`.
- [x] F3. Real manual QA — el humano ejecuta el runbook con su Meta App + token (único paso humano, fuera de todos agent); agent ya probó `--dry-run`/`--mock` + guards 500/timeout + quota `3/250` con evidencia en `.omo/evidence/`.
- [x] F4. Scope fidelity — sin `apps/*`, sin `npm install`, sin secretos commiteados (`.env.example` placeholders, `git check-ignore` ok), publisher real sigue diferido con plantilla go/no-go en README.

## Commit strategy
- 6 commits atómicos (uno por todo, `chore`/`feat`/`docs` con scope `threads-spike`), rama `feat/threads-meta-test-spike` desde `dev`; convención `commitlint` (pre-commit/pre-push vigentes). Push + PR a `dev` solo al final si el humano quiere conservar el spike; si no, la carpeta se borra (`rm -rf threads-meta-test/.env` primero).

## Success criteria
- `threads-meta-test/` corre `auth-url --dry-run`, `exchange --mock`, `publish --mock/--dry-run`, `quota --mock` en verde sin red real ni secretos.
- README guía al humano desde Meta App hasta su primer post TEXT real + decisión go/no-go documentada para el publisher NestJS (clon `crypto-news-publisher`).
- Cero toques fuera de `threads-meta-test/`, cero deps nuevas, cero leaks (F1/F2/F4 APPROVE).
