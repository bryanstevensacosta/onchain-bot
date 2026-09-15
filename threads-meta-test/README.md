# Threads Meta Test (spike aislado)

Spike mínimo para validar la API de Threads antes de decidir si se construye un publisher real en NestJS.
Solo scripts `.mjs` sin dependencias, dentro de `threads-meta-test/`. No toca `apps/*`.

Docs oficiales:

- Hub: https://developers.facebook.com/docs/threads
- Get started: https://developers.facebook.com/docs/threads/get-started/
- Threads Use Case (crear la app): https://developers.facebook.com/docs/development/create-an-app/threads-use-case/
- Long-lived tokens: https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/
- Posts (publicar): https://developers.facebook.com/docs/threads/posts/
- Overview (límites): https://developers.facebook.com/docs/threads/overview/
- Changelog: https://developers.facebook.com/docs/threads/changelog/

OUT explícito de este spike: NO hay publisher real, NO hay media/imagen/carrusel, NO hay cron/auto-refresh, NO hay App Review, NO se publica en cuenta productiva sin confirmación.

## 1 Prerrequisitos (lo que hace el humano en el navegador)

1. Crea una Meta App en https://developers.facebook.com/apps con el **Threads Use Case** (guía: https://developers.facebook.com/docs/development/create-an-app/threads-use-case/). Apunta el **Threads App ID** (no el App ID genérico, usa el de Threads).
2. En la app, añade un **Threads Tester**: App roles > Roles > Add people > Threads Tester, e invita tu cuenta de Threads. Acepta la invitación desde esa cuenta. Sin App Review funciona de inmediato para testers, el review solo hace falta para uso público. Costo $0.
3. Configura la `redirect_uri`: debe ser una URL exacta registrada en la app (para prueba local vale `https://localhost/cb` si la registras tal cual). El formulario de la app también exige rellenar las callback URLs de Deauthorize + Delete (vale la misma `https://localhost/cb`) o no deja guardar. Los scopes son `threads_basic,threads_content_publish`.
4. Consigue un `code` de autorización: abre la URL que genera `auth-url.mjs` (paso 3.1), autoriza, y copia el parámetro `code` de la redirección. Alternativa: Graph API Explorer de Meta.
5. Requisitos locales: Node 22+, este repo clonado, sin `npm install` extra (los scripts usan `fetch` nativo, cero deps).

## 2 Setup `.env`

El `.env` real NO existe en este repo (está en `.gitignore`, verificado con `git check-ignore -v threads-meta-test/.env`). Empieza siempre así:

```bash
cp threads-meta-test/.env.example threads-meta-test/.env
```

Edita `threads-meta-test/.env` con tus valores reales. Nunca hagas `export` de secretos en un host compartido; si pegas un token en terminal, limpia el historial después con `set -o history -c` (zsh: `history -c` no borra el fichero, revisa `~/.zsh_history` si hace falta).

Tabla de variables:

| Variable | Obligatoria | Usada por | Para qué |
|---|---|---|---|
| `THREADS_APP_ID` | sí | `auth-url.mjs`, `exchange.mjs` | Threads App ID de tu Meta App |
| `THREADS_APP_SECRET` | sí | `exchange.mjs` | App Secret (solo paso short, POST form-encoded) |
| `THREADS_REDIRECT_URI` | sí | `auth-url.mjs`, `exchange.mjs` | Debe coincidir exacta con la registrada |
| `THREADS_SCOPES` | no | (documental) | Valor esperado: `threads_basic,threads_content_publish` |
| `THREADS_AUTH_CODE` | no | (documental) | Guarda a mano el `code` que te llega; se pasa por `--code` |
| `THREADS_ACCESS_TOKEN` | sí (pasos 3.3, 3.4) | `publish.mjs`, `quota.mjs` | Token short o long; `publish` rechaza `FAKE`/`PASTE_ME` |
| `APP_MODE` | no | (documental) | Etiqueta libre del entorno (p. ej. `spike`) |
| `THREADS_USER_ID` | no (default `me`) | `publish.mjs`, `quota.mjs` | ID numérico del usuario de Threads; `me` funciona con tu token |
| `THREADS_STATE` | no | `auth-url.mjs` | Parámetro `state` anti-CSRF de OAuth; se añade a la URL si está definido |

Notas de lectura: `lib/env.mjs` solo parsea `threads-meta-test/.env` (formato `KEY=value`, ignora `#` y líneas vacías); `process.env` tiene prioridad sobre el fichero. Ningún script lee el `.env` de la raíz.

## 3 Scripts (qué hace cada uno + `--help` verbatim + ejemplo sin red)

Orden de uso: `auth-url` → `exchange` → `quota` → `publish`.

### 3.0 `lib/env.mjs` (librería, sin CLI)

No tiene `--help` (es módulo importado por los otros cuatro). Parsea `threads-meta-test/.env`:

```bash
node --check threads-meta-test/lib/env.mjs && echo OK
```

```
OK
```

### 3.1 `auth-url.mjs` (construye la authorize URL, offline, sin red)

Salida verbatim de `--help`:

```
Usage: node threads-meta-test/auth-url.mjs [--dry-run]

Build the Threads OAuth authorize URL (offline, no network).
Reads threads-meta-test/.env via lib/env.mjs (falls back to process.env).

Example:
  node threads-meta-test/auth-url.mjs --dry-run
```

Ejemplo sin red (con valores de ejemplo, el token real va en tu `.env`):

```bash
THREADS_APP_ID=123456789 THREADS_REDIRECT_URI=https://localhost/cb node threads-meta-test/auth-url.mjs --dry-run
```

Salida esperada:

```
https://threads.net/oauth/authorize?client_id=123456789&redirect_uri=https%3A%2F%2Flocalhost%2Fcb&scope=threads_basic,threads_content_publish&response_type=code
```

Con `THREADS_STATE=abc123` se añade `&state=abc123` al final. Abre esa URL en el navegador, autoriza y copia el `code`.

### 3.2 `exchange.mjs` (code → short → long)

Salida verbatim de `--help`:

```
Usage: node threads-meta-test/exchange.mjs --code <CODE> [--mock] [--print-token]

Pasos:
  1. POST https://graph.threads.net/oauth/access_token {client_id,client_secret,code,grant_type=authorization_code,redirect_uri} -> short-lived token + user_id
  2. GET https://graph.threads.net/access_token?grant_type=th_exchange_token -> long-lived token + expires_in
  3. Nota refresh: GET .../refresh_access_token?grant_type=th_refresh_token (solo si expires_in >= 24h; grant publico 90d auto-extiende, privada exige re-auth)
  --print-token: solo rama real, imprime LONG_TOKEN=<token completo> tras la linea enmascarada (aviso: queda en el historial del terminal; ejecuta con un espacio inicial o limpia el historial despues)

Ejemplo:
  node threads-meta-test/exchange.mjs --code <CODE>
  node threads-meta-test/exchange.mjs --code FAKE --mock
```

Nota: ayuda y código coinciden en el paso 2 (short por POST form-encoded a `https://graph.threads.net/oauth/access_token`, long por GET a `https://graph.threads.net/access_token` sin el prefijo `oauth/`).

Ejemplo `--mock` (cero red, cero escritura):

```bash
node threads-meta-test/exchange.mjs --code FAKE --mock
```

Salida esperada:

```
[mock] paso 1 short: POST oauth/access_token (grant_type=authorization_code) -> short
short=***HORT user_id=***
[mock] paso 2 short->long: GET access_token?grant_type=th_exchange_token -> long
long=***LONG expires_in=5184000
refresh: GET .../refresh_access_token?grant_type=th_refresh_token (expires_in >= 24h)
nota: grant publico 90d auto-extiende con refresh; privada exige re-auth
```

Uso real (con red):

```bash
node threads-meta-test/exchange.mjs --code <CODE-DEL-PASO-3.1>
```

Guarda el `long` resultante como `THREADS_ACCESS_TOKEN` en tu `.env`. Guards: sin `--code` sale exit 1 (`MISSING --code`); `--code FAKE` sin `--mock` sale exit 1 (`REFUSE FAKE TOKEN`).

### 3.3 `publish.mjs` (flujo TEXT en 2 pasos + poll 3s x10 + guard 500)

Salida verbatim de `--help`:

```
Usage: node threads-meta-test/publish.mjs --text "..." [--dry-run|--mock|--mock=never-finishes]

2-step TEXT flow (https://developers.facebook.com/docs/threads/posts/):
  1. POST /{uid}/threads { media_type: TEXT, text } -> container id
  2. Poll container status every 3s x10 until FINISHED (~30s)
  3. POST /{uid}/threads_publish { creation_id } -> published
Limits: text <= 500 chars, 250 posts/24h

Example:
  THREADS_ACCESS_TOKEN=FAKE node threads-meta-test/publish.mjs --text "spike" --dry-run
```

Ejemplo `--dry-run` (cero `fetch`):

```bash
THREADS_ACCESS_TOKEN=FAKE node threads-meta-test/publish.mjs --text "spike" --dry-run
```

Salida esperada:

```
DRY-RUN token=*** uid=me
DRY-RUN POST https://graph.threads.net/v1.0/me/threads payload={"media_type":"TEXT","text":"spike"}
DRY-RUN poll status 3s x10 until FINISHED
DRY-RUN POST https://graph.threads.net/v1.0/me/threads_publish payload={ creation_id: "<container-id>" }
```

Ejemplo `--mock` (cero `fetch`):

```bash
node threads-meta-test/publish.mjs --text "spike" --mock
```

Salida esperada:

```
MOCK container id=mock-container-123
MOCK poll attempt 1/10 status=IN_PROGRESS
MOCK poll attempt 2/10 status=IN_PROGRESS
MOCK poll attempt 3/10 status=FINISHED
MOCK published id=mock-media-456 creation_id=mock-container-123
FINISHED id=mock-media-456
```

Variante timeout: `--mock=never-finishes` simula un container que nunca llega a FINISHED y sale exit 2 (`TIMEOUT ... after 10 attempts`). Guards: texto de más de 500 chars sale exit 1 (`TEXT_TOO_LONG len=...`); token ausente o `FAKE`/`PASTE_ME` en rama real sale exit 1.

Primer post TEXT real (solo el humano, con token real en `.env`):

```bash
node threads-meta-test/publish.mjs --text "Hola desde el spike de Threads, post 1"
```

Espera el poll (~30s) y confirma `FINISHED id=...`. El poll pregunta `GET /{container-id}?fields=status` (verificado en vivo: `status_code` devuelve HTTP 400, ver sección 6). Verifica el post visible en tu perfil de Threads.

### 3.4 `quota.mjs` (solo lectura)

Salida verbatim de `--help`:

```
Usage: node threads-meta-test/quota.mjs [--mock]

Reads (read-only): GET /{threads-user-id}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config
Base: https://graph.threads.net/v1.0
Quotas: 250 posts/24h, 1000 replies/24h, 100 follows/24h, 4800x impressions cap.
Stateless: no local counter, no file/DB writes.

Example:
  node threads-meta-test/quota.mjs --mock
  THREADS_ACCESS_TOKEN=... THREADS_USER_ID=me node threads-meta-test/quota.mjs
```

Ejemplo `--mock` (cero red):

```bash
node threads-meta-test/quota.mjs --mock
```

Salida esperada:

```
used: 3/250
resets_at: mock (no network, stateless)
```

Uso real (con red, read-only, no publica nada):

```bash
node threads-meta-test/quota.mjs
```

Salida esperada (valores reales según tu cuenta):

```
GET https://graph.threads.net/v1.0/me/threads_publishing_limit (token ***abcd)
used: 0/250
resets_at: ...
```

Guards: sin token sale exit 1; token `FAKE` sale exit 1 (`REFUSE FAKE TOKEN`).

## 4 Límites y quotas

- Texto: máximo **500 caracteres** por post (`publish.mjs` lo valida antes de llamar a la red, exit 1 con `TEXT_TOO_LONG`).
- Posts: **250 posts cada 24h** por usuario. El endpoint de quota es `GET /{threads-user-id}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config` (base `https://graph.threads.net/v1.0`).
- Links: más de **5 links** en un post lo rechaza la API (`LINK_EXCEEDED`). Este spike solo publica TEXT plano, así que evita pegar más de 5 URLs.
- Replies: **1000 replies cada 24h** (`reply_quota_usage` / `reply_config` en el mismo endpoint; este spike no publica replies, solo lee el campo).
- Follows: 100 cada 24h. Impressions cap 4800x. Deletes: la API permite borrar posts propios (`DELETE /{media-id}`), este spike no lo implementa; si necesitas limpiar el post de prueba, bórralo desde la app de Threads.
- Container: tras crear el container, el estado tarda unos **30s** en pasar a FINISHED; `publish.mjs` hace poll cada 3s hasta 10 intentos. Si expira el tiempo, sale exit 2 y el container queda en estado intermedio (reintenta con un texto nuevo, no reutilices el container).
- `quota.mjs` es stateless: no guarda contador local ni escribe ficheros o DB, siempre pregunta a la API.
- Quota con HTTP 500 persistente: observado en vivo (3 intentos con token válido, fallo del lado de Meta, no de auth). Reintenta más tarde; no bloquea publicar. Variante a probar: user-id numérico en vez de `me`.

Referencias: posts https://developers.facebook.com/docs/threads/posts/, overview https://developers.facebook.com/docs/threads/overview/, changelog https://developers.facebook.com/docs/threads/changelog/.

## 5 Expiración del token, revoke y grant público vs cuenta privada

- Short-lived token: dura **~1 hora**. Se obtiene en el paso 1 de `exchange.mjs` (POST form-encoded con `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`).
- Long-lived token: dura **60 días** (`expires_in=5184000`). Se obtiene en el paso 2 (GET `https://graph.threads.net/access_token?grant_type=th_exchange_token` con `client_secret` + short token).
- Refresh: `GET .../refresh_access_token?grant_type=th_refresh_token`, solo si al token le quedan **24h o más** (`expires_in >= 86400`). `exchange.mjs` imprime esta nota automáticamente cuando aplica.
- Grant **público (cuenta pública)**: recomendado para este spike. El refresh auto-extiende el grant hasta **90 días** sin re-autorizar.
- Cuenta **privada**: el refresh NO extiende; cada ~90 días (o al expirar) exige **re-auth completa** (repetir paso 3.1 y 3.2). Si tu cuenta de pruebas es privada, anótalo en la decisión go/no-go.
- Revoke: para invalidar un token, quita el permiso desde la cuenta de Threads (Ajustes > Permisos de apps y sitios web) o elimina al tester de la Meta App. Después, `quota.mjs` fallará con HTTP 4xx y `publish.mjs` con `CREATE_FAILED`; genera un token nuevo repitiendo el runbook desde el paso 3.1.
- Guarda el long-lived token como `THREADS_ACCESS_TOKEN` en `threads-meta-test/.env` y no lo pegues en chats, issues ni commits (ver sección 7 para limpiar).

Referencia: https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/.

## 6 Troubleshooting

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `redirect_uri_mismatch` (OAuth) | La `redirect_uri` no coincide exacta con la registrada | Compara byte a byte con la registrada en la app (esquema, host, path, barra final). Regenera la URL con `auth-url.mjs` y reintenta |
| `MISSING THREADS_APP_ID` | No hay `.env` o falta la variable | `cp threads-meta-test/.env.example threads-meta-test/.env` y rellena los `PASTE_ME` |
| Código inválido / expirado en `exchange` | El `code` es de un solo uso y caduca en minutos | Genera una URL nueva (paso 3.1), autoriza de nuevo y usa el `code` fresco en menos de 5 min |
| `EXCHANGE FAILED short step HTTP 4xx` | Secret erróneo, code reutilizado o `redirect_uri` distinta a la del paso authorize | Verifica `THREADS_APP_SECRET`, usa un `code` nuevo y la misma `redirect_uri` en ambos pasos |
| `EXCHANGE FAILED long step HTTP 4xx` | Short token inválido o expirado | Repite el paso 1 con un `code` fresco |
| `REFUSE FAKE TOKEN` (exit 1) | Pasaste `--code FAKE` sin `--mock`, o token `FAKE` en `quota` | Fake solo vale con `--mock` / `--dry-run`; para red real usa el token del `.env` |
| Container `ERROR` / `EXPIRED` | Contenido rechazado o container caducado | Revisa el texto (links, longitud); crea un container nuevo con otro texto, no reutilices el id |
| `TIMEOUT container ... after 10 attempts` (exit 2) | El container no llegó a FINISHED en ~30s | Reintenta; si persiste, publica un texto más corto y simple y verifica el estado en la app |
| Poll imprime `UNKNOWN` x10 y termina en `TIMEOUT` sin publicar | La API viva rechaza `fields=status_code` (HTTP 400 `Tried accessing nonexisting field`); ya corregido, el poll usa `fields=status` | Si reaparece, revisa que `publish.mjs` pida `?fields=status` y lea `json.status` primero |
| Quota falla con `HTTP 500` persistente | Fallo del lado de Meta en `threads_publishing_limit` (token válido: exchange + publish salen exit 0) | Reintenta más tarde; no bloquea publicar. Variante a probar: user-id numérico en vez de `me` |
| HTTP `429` | Rate limit (posts/24h u otras quotas) | Corre `quota.mjs` real, lee `used` y `resets_at`, y espera a la ventana de reset antes de reintentar |
| `TEXT_TOO_LONG len=...` (exit 1) | Texto de más de 500 chars | Acorta el texto por debajo de 500 caracteres |
| `CREATE_FAILED` / `PUBLISH_FAILED` | Token expirado/revocado o sin scope `threads_content_publish` | Revisa sección 5 (refresh o re-auth) y que autorizaste ambos scopes |

## 7 Teardown (limpiar secretos)

El `.env` real nunca se commitea (gitignored). Al terminar el spike, bórralo:

```bash
rm threads-meta-test/.env
```

Verifica que no queda nada sensible en el árbol (debe imprimir `NO-SECRETS`):

```bash
PAT='e''yJ|TH''AA[A-Za-z0-9_-]{10,}|BEG''IN .*PR''IVATE'; grep -riE "$PAT" threads-meta-test/ || echo NO-SECRETS
```

Y confirma que solo `threads-meta-test/` aparece como cambio nuevo:

```bash
git status --porcelain
```

Si ves otras líneas, son harness o untracked preexistente, no de este spike.

## 8 Decisión go / no-go (publisher real)

Rellena esta plantilla al terminar el runbook. El publisher real (BC NestJS clonando `crypto-news-publisher`) solo se diseña si hay GO.

```markdown
### Threads publisher, decisión go/no-go (fecha: ____)

- [ ] Post TEXT real visible en Threads (id: ____, url: ____)
- [ ] Quota leída con `quota.mjs` real (used: ____/250, resets_at: ____)
- [ ] Token long-lived guardado solo en `threads-meta-test/.env` (nunca en git)
- [ ] Tipo de cuenta: pública (refresh auto-extiende 90d) / privada (exige re-auth)
- [ ] Decisión: GO (diseñar BC threads-publisher) / NO-GO (motivo: ____)

Si GO: diseñar BC `threads-publisher` clonando `crypto-news-publisher`
(enqueue + cron + LLM opcional), con sus 3 flags (matching/llm/publishing) y
rate limit 250/24h + guard 500 chars + poll 3s x10.

Si NO-GO: anotar motivo (p. ej. cuenta privada exige re-auth, 429 persistente,
App Review bloqueante para el caso de uso) y archivar este spike con `rm
threads-meta-test/.env`.
```
