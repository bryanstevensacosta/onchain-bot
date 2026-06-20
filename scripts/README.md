# Scripts

## `telegram-gen-session.ts`

Generates a fresh `TELEGRAM_MTPROTO_SESSION` string for gramJS using the
user-account credentials from `TELEGRAM_MTPROTO_API_ID` / `HASH`.

Run it whenever the session expires or gets invalidated
(`AUTH_KEY_UNREGISTERED`, `AUTH_KEY_INVALID`, etc.).

### Usage

```bash
# Load env from .env so API_ID and API_HASH are picked up
set -a && source .env && set +a

# Run
npm run telegram:gen-session
# or directly (avoids the broken ts-node bin wrapper on some Node 22 setups):
node -e "require('ts-node/register/transpile-only');require('./scripts/telegram-gen-session.ts')"
```

You will be prompted for:

1. **Phone number** in international format (e.g. `+34612345678`).
2. **Login code** sent by Telegram (app or SMS).
3. **2FA password** if you have two-step verification enabled.

The script prints a new `TELEGRAM_MTPROTO_SESSION` value. Paste it into
`.env` and restart the app. The first run after the change should log:

```
Telegram MTProto session already authorized.
Subscribed to N channel(s)
```

instead of:

```
Telegram session is not authorized — listener will idle.
```
