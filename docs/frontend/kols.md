# Channels (`/kols`)

**What it is for:** managing the Telegram channels you listen to, and
seeing which ones give the best tips.

**What you see:** a list of channels, each with its name, whether it is
active or paused, when it was last heard from, and a trust score (how
good its past tips were). A ranking board orders channels from best to
worst.

**What you can do here:**

- Add a new channel (paste its Telegram name or number).
- Pause a noisy channel or restart a paused one.
- Re-check a channel's trust score after choosing a scoring recipe.

**Trip you can take here:** notice a channel gives bad tips → open this
screen → pause it → its messages stop flowing into the system.

| What the screen shows or does | Where it gets it from                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Channel list                  | `GET /ingestion-api/feed/sources?type=kol`                                   |
| Trust scores + ranking board  | `GET /telegram-kol/reputation/kols`, `GET /telegram-kol/reputation/kols/top` |
| One channel's trust score     | `GET /telegram-kol/reputation/kols/:id`                                      |
| Pause / restart a channel     | `POST /ingestion-api/feed/sources/:id/toggle`                                |
| Add a channel                 | `POST /ingestion-api/feed/sources`                                           |
| Re-check a trust score        | `POST /telegram-kol/reputation/kols/recompute/:id`                           |
