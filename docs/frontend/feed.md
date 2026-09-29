# Newsroom (`/feed`)

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

> Two old addresses send you here automatically: `/profiles` and
> `/crypto-news`. They exist only so old saved links do not break.
