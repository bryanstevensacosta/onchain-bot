# Grouped views (`/templates`)

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
