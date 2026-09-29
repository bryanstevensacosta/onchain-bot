# Home (`/`)

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
