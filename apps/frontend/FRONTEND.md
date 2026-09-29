# Frontend — What the Screens Are For

This file describes the screens of the dashboard in plain words.
It is written for anyone, no coding knowledge needed.

The dashboard is the control panel of the whole system. It lets you watch
what is happening, look up past results, manage who you listen to, set up
automatic posting, and fix things by hand when needed.

> The only technical details in this file are web addresses (routes) and
> the list of places each screen gets its information from. Everything
> else is plain language.

---

## 1. Home (`/`)

**What it is for:** the first screen you see. A quick glance at "is
everything working, and what just happened?"

**What you see:**

- Four summary cards at the top: how many watched channels are active,
  how many coins have been spotted, what share passed the checks, and
  how many were posted to the private channel.
- A health box showing whether the listening service (the part that
  hears Telegram) is reachable.
- A live feed: the newest events as they happen (a coin was scored, a
  coin passed or failed the checks, a new coin card was created).
- A table of the highest-scoring coins right now.
- A list of coins being followed over time, with their price progress.

**What you can do here:** watch only. To act, go to the other screens.
A small dot at the bottom-right tells you if the live updates are
connected (green) or disconnected (red).

| What the screen shows   | Where it gets it from                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Watched channels health | `GET /ingestion-api/feed/stats`                                                                                                                              |
| Summary cards           | `GET /ingestion-api/feed/stats`, `GET /token/normalization/tokens/recent`, `GET /token/vip-call-approval/decisions/recent`, `GET /vip-calls/calls/published` |
| Live feed events        | Live updates channel, plus `GET /token/vip-call-approval/decisions/recent` for recent history                                                                |
| Top coins table         | `GET /token/scoring/tokens/top`                                                                                                                              |
| Followed coins          | `GET /call-tracking/tracked`                                                                                                                                 |

---

## 2. Coins (`/tokens`)

**What it is for:** browsing every coin the system has seen, like
flipping through a card file.

**What you see:** a list of coins, each with its name, picture, score
out of 100, and whether it passed or failed the checks. Three tabs let
you see all coins, only the ones that passed, or only the ones that
failed. Clicking a coin opens its detail page (see next screen).

**Trip you can take here:** open the list → pick the "passed" tab to
see only winners → click a coin to see why it passed.

| What the screen shows                  | Where it gets it from                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coin list (all / passed / failed tabs) | `GET /token/vip-call-approval/decisions/recent`, `GET /token/vip-call-approval/decisions/approved`, `GET /token/vip-call-approval/decisions/rejected` |
| Score next to each coin                | `GET /token/scoring/tokens/recent`                                                                                                                    |
| Coin names                             | `GET /token/normalization/tokens/recent`                                                                                                              |

---

## 3. Coin detail (`/tokens/:chain/:address`)

**What it is for:** answering "tell me everything about THIS one coin."

**What you see:** the coin's picture, name, short name, and which
network it lives on; its score with a dial and the step-by-step math
behind the score (what added points, what took points away); a market
snapshot (price, total value, available money to trade, holders); and a
warning badge if one owner holds a big share of the coins (risky
because they could sell all at once).

**Trip you can take here:** from the coins list, click a coin → read
the score math → check the owner-risk badge → decide if you trust it.

| What the screen shows                   | Where it gets it from                                           |
| --------------------------------------- | --------------------------------------------------------------- |
| Coin card (name, short name)            | `GET /token/normalization/tokens/:chain/:address`               |
| Score + score math                      | `GET /token/scoring/tokens/:chain/:address`                     |
| Market snapshot (price, value, holders) | `GET /token/enrichment/snapshots/:chain/:address`               |
| Owner-risk badge                        | `GET /market-data-api/api/market-data/snapshot?chain=&address=` |

---

## 4. Channels (`/kols`)

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

---

## 5. Newsroom (`/feed`)

**What it is for:** the biggest screen. Reading incoming news messages,
choosing which ones get posted automatically, and setting the rules for
that.

**What you see (top to bottom):**

- **Work sessions box:** a picker at the top lets you choose which work
  session is active. A session is a bundle of rules (which channels to
  watch, which words to look for, where to post, whether the automatic
  writer is on). You can create a new session, open one, save its rules
  as a reusable starting template, turn it on or off, or delete it. The
  session window has six folders: Overview, Sources, Words, Filters,
  Writer, Target.
- **Messages:** the newest incoming news messages with pictures, which
  channel each came from, and a search box. Long messages can be
  unfolded. Pictures open full-screen with arrow keys to move between
  them.
- **Waiting line:** messages that matched the rules and are waiting to
  be posted, with their state (waiting, scheduled, posting, posted,
  failed, blocked) and a button to cancel one.
- **Schedules and ads:** planned posts and adverts, when each goes out,
  and the photo library they use.
- **Word lists:** the watchwords that select messages, the must-appear-
  together word groups, and the banned words that block a message.
- **Writer settings:** which automatic writer is used, its instructions,
  and three on/off switches: keep looking for matches, let the writer
  rewrite, allow posting.

**Trips you can take here:**

- _View the feed:_ open the screen → scroll the messages → click a
  picture to see it big.
- _Manage sessions:_ open the screen → pick a session from the picker →
  change its words or channels → press Save → press Activate so it
  starts working.
- _Set up automatic posting:_ pick a session → add watchwords in the
  Words folder → choose the target channel in the Target folder → turn
  on all three switches.

| What the screen shows or does                    | Where it gets it from                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages                                         | `GET /ingestion-api/feed/messages?limit=50&type=crypto-news`                                                                                       |
| Channels                                         | `GET /ingestion-api/feed/sources?type=crypto-news`                                                                                                 |
| Pictures and videos                              | `GET /ingestion-api/media/:channelId/:messageId/:index`                                                                                            |
| Sessions (open, create, turn on/off, delete)     | `GET/POST/PATCH/DELETE /feed-api/api/sessions`, `POST /feed-api/api/sessions/:id/activate`, `POST /feed-api/api/sessions/:id/deactivate`           |
| Reusable starting templates (save, open, delete) | `GET/POST/DELETE /feed-api/api/content-templates`                                                                                                  |
| Waiting line                                     | `GET /feed-api/api/queue`, `GET /feed-api/api/queue/stats`                                                                                         |
| Watchwords / banned words in a session           | `GET /feed-api/feed-publisher/keywords`, `GET /feed-api/feed-publisher/blacklist`                                                                  |
| Per-channel clean-up rules                       | `GET /feed-api/feed-publisher/sources/:channelId/filters`, `GET /feed-api/feed-publisher/sources/:channelId/filters/preview`                       |
| Check one message against the rules              | `GET /feed-api/feed-publisher/matching/messages/:channelId/:messageId/status`, `POST /feed-api/feed-publisher/matching/evaluate`                   |
| Matching on/off                                  | `GET /feed-api/feed-publisher/matching/config`                                                                                                     |
| Writer settings + on/off switches                | `GET /feed-api/api/llm/config`, `GET /feed-api/api/llm/flags`, `GET /feed-api/api/llm/models`, `GET /feed-api/api/llm/templates`                   |
| Planned posts, ads, photo library                | `GET /scheduling-api/api/scheduling/ads`, `GET /scheduling-api/api/scheduling/rotation-config`, `GET /scheduling-api/api/scheduling/media/library` |

---

## 6. Writer practice room (`/playground`)

**What it is for:** trying out the instructions given to the automatic
writer, safely, before using them for real.

**What you see:** an editor where you write or change the instructions,
a sample of a real message, a button that shows how the finished post
would look, and a button that asks the writer for one test post (each
test uses one paid writer call). Good drafts can be saved as a reusable
template.

**Trip you can take here:** open the screen → edit the instructions →
press preview → press one test → save as template → use it in a newsroom
session.

| What the screen shows or does | Where it gets it from              |
| ----------------------------- | ---------------------------------- |
| Test a draft with the writer  | `POST /feed-api/api/llm/preview`   |
| Save a draft as a template    | `POST /feed-api/api/llm/templates` |
| Saved templates               | `GET /feed-api/api/llm/templates`  |

---

## 7. Short-posts screen (`/threads`)

**What it is for:** preparing short posts (the kind published as
threads), with its own words, waiting line, and writer settings —
separate from the newsroom.

**What you see:** the same building blocks as the newsroom (watchwords,
banned words, waiting line, writer settings, three on/off switches) but
for short posts. One corner of the screen carries a notice: the
automatic sending of threads is not built yet, so the waiting line only
collects and shows what WOULD be sent.

**Trip you can take here:** open the screen → add watchwords → check
the waiting line fills up → knowing nothing is sent yet, only gathered.

| What the screen shows or does    | Where it gets it from                                                           |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Watchwords                       | `GET /feed-threads-publisher/keywords`                                          |
| Banned words                     | `GET /feed-threads-publisher/blacklist`                                         |
| Must-appear-together word groups | `GET /feed-threads-publisher/phrases`                                           |
| Waiting line                     | `GET /feed-threads-publisher/queue`, `GET /feed-threads-publisher/queue/counts` |
| Writer settings + switches       | `GET /feed-threads-publisher/llm/config`                                        |
| Matching on/off                  | `GET /threads/matching/config`                                                  |

---

## 8. Grouped views (`/templates`)

**What it is for:** looking at past tips grouped the way YOU want —
pick a saved view (for example "only Solana coins" or "only gaming
coins") and see its calls, rankings, and settings.

**What you see:** a picker for the saved view; tick-boxes to narrow it
to certain channels (unticking all means "all channels"); a table of
past calls with profit multiples; a ranking of the best channels split
into two halves of five with an arrow button to flip the order; a strip
of the ten most active callers with a 30-day / 7-day / 1-day switch; and
the view's settings shown read-only (which channels, minimum score,
special patterns, where it posts).

**Trip you can take here:** open the screen → pick a saved view → tick
two channels to narrow it → read the ranking → see who calls best.

| What the screen shows or does          | Where it gets it from                                  |
| -------------------------------------- | ------------------------------------------------------ |
| Saved views list + one view's settings | `GET /kol-api/templates`, `GET /kol-api/templates/:id` |
| Past calls + profit ranking            | `GET /kol-api/templates/:id/rankings`                  |
| Most active callers                    | `GET /kol-api/kol-rankings?window=&sort=`              |
| Change which channels a view covers    | `PATCH /kol-api/templates/:id/sources`                 |
| Channel pictures                       | `GET /ingestion-api/kol-avatar/:channelId`             |

---

## 9. Market data (`/market-data`)

**What it is for:** looking up raw market facts about any coin or wallet
address, without any scores or opinions — just the facts.

**What you see:** the list of supported networks; a box where you paste
an address to find which network it belongs to; the health of the price
sources (which ones answer fast, which are down); a lookup box that
shows what an address IS (coin, wallet, program, exchange, unknown) with
its fields; and a box where you can paste many addresses at once for a
batch lookup.

**Trip you can take here:** someone sends you an address → paste it in
the lookup box → see it is a coin with its price and holders → done, no
score attached.

| What the screen shows or does       | Where it gets it from                                           |
| ----------------------------------- | --------------------------------------------------------------- |
| Supported networks                  | `GET /market-data-api/api/v1/chains`                            |
| Which network an address belongs to | `GET /market-data-api/api/v1/chains/detect?address=`            |
| Health of price sources             | `GET /market-data-api/api/v1/providers`                         |
| What an address is + its facts      | `GET /market-data-api/api/v1/addresses/:chain/:address`         |
| Short market summary (older shape)  | `GET /market-data-api/api/market-data/snapshot?chain=&address=` |
| Many addresses at once              | `POST /market-data-api/api/v1/addresses/batch`                  |

---

## 10. Scanner (`/dexter`)

**What it is for:** the fastest screen in the app. Paste anything about
a coin — an address, or a short command with an address — and get an
instant full report or a price chart.

**What you see:** a big search box at the top (it remembers your last
ten searches, reopened with one click); a full report card for a
`/x` scan (what the address is, price, total value, supplies, holders,
owner-risk warning); a chart card for a `/c` scan (links to the price
charts plus price context); and at the very top, which chat robot is
connected for scanning, with buttons to connect or disconnect it.

**How the search box understands you:** paste a bare address and it
figures out the network by its shape (long addresses starting with
`0x` are treated as Ethereum-style; shorter letter-soup addresses are
treated as Solana). If you paste an Ethereum-style address without
saying which exact network, it tells you it assumed Ethereum and names
the other possible networks. Typing `/x` before the address gives the
full report; `/c` gives the chart.

**Trip you can take here:** copy an address from a chat → paste it in
the box → read the full report card → press a chart link to see the
price graph.

| What the screen shows or does                          | Where it gets it from                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Full report / chart (same facts as Market data screen) | `GET /market-data-api/api/v1/addresses/:chain/:address`, `GET /market-data-api/api/market-data/snapshot?chain=&address=` |
| Which network a pasted address belongs to              | `GET /market-data-api/api/v1/chains/detect?address=`                                                                     |
| Connected chat robot                                   | `GET /dexter-api/api/dexter-bots/inventory`                                                                              |
| Connect / disconnect the robot                         | `POST /dexter-api/api/dexter-bots/bind`, `POST /dexter-api/api/dexter-bots/unbind`                                       |

---

## 11. Workshop (`/ops`)

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

---

## 12. Old addresses that still work

Two old addresses send you to the newsroom automatically: `/profiles`
and `/crypto-news`. They exist only so old saved links do not break.

| Old address    | Where it sends you |
| -------------- | ------------------ |
| `/profiles`    | `/feed`            |
| `/crypto-news` | `/feed`            |

---

## 13. Missing screens (gaps against the agreed plans)

These are things the agreed plans describe but the screens do not fully
offer yet:

1. **Approve waiting calls one by one (template pending approvals):**
   the system sets aside a place for calls waiting for a human yes/no
   (`GET /kol-api/templates/:id/pending-approvals`), but no screen shows
   this list yet. You cannot approve or reject from the dashboard.
2. **Change a grouped view's posting setup from its screen:** the
   grouped-views screen shows where each view posts (which chat robot
   and channel) but read-only. To change the robot or channel you must go
   elsewhere; there is no edit button on this screen.
3. **Ready-made message shapes for the scanner:** the plan calls for a
   saved set of four message shapes (full report, short report, alert,
   waiting/error) with a tool to edit them and see a preview. No screen
   offers this editor yet; the scanner shows fixed shapes only.
4. **Per-kind fact layouts on the market screen:** the plan says each
   kind of address (coin, wallet, program, exchange) should show its own
   fitting set of fields. Today one shared layout is used and empty parts
   are hidden, which is close but not the fitted layouts described.
5. **Kind check when adding a channel:** the plan says adding a channel
   should refuse robots and personal accounts and accept only channels
   and groups, showing the kind before saving. The add-channel box today
   takes a name or number without showing or enforcing this check.
6. **Live pushing everywhere instead of re-asking:** the plan wants
   screens to update through live pushes (new messages, waiting-line
   changes, health, ranking changes). Today the screens re-ask the system
   every few seconds instead, except the home live feed.
7. **Posting from the short-posts screen:** as noted on the screen
   itself, the waiting line there only collects; sending is not built
   yet. The screen honestly says so.
