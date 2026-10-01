# Workshop (`/ops`)

**What it is for:** hand tools for the operator. Fixing and testing by
hand — use with care.

**What you see:** three folders.

- **Replay a message:** paste a raw Telegram message and run it through
  the reading step again, to see what the system finds in it.
- **Clean-up rules:** the find-and-replace rules applied to incoming
  texts before matching (what text to find, what to replace it with,
  how important each rule is), with a live preview.
- **Saved rule sets:** named snapshots of all settings, so you can save
  a known-good setup and bring it back later.

**Trip you can take here:** a message was read wrongly → paste it in
Replay → see what the system finds → adjust the clean-up rules if needed.

| What the screen shows or does    | Where it gets it from                            |
| -------------------------------- | ------------------------------------------------ |
| Replay a pasted message          | `POST /token/intake/extraction/extract`          |
| Clean-up rules + saved rule sets | `GET /settings/filters`, `GET /settings/presets` |
