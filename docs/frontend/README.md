# Frontend screens

Plain-language description of each dashboard screen. Written for
anyone, no coding knowledge needed.

The dashboard is the control panel of the whole system. It lets you watch
what is happening, look up past results, manage who you listen to, set up
automatic posting, and fix things by hand when needed.

> The only technical details in these files are web addresses (routes) and
> the list of places each screen gets its information from. Everything
> else is plain language.

## Screens

| Screen                                       | File                             |
| -------------------------------------------- | -------------------------------- |
| Home (`/`)                                   | [dashboard.md](dashboard.md)     |
| Coins (`/tokens`, `/tokens/:chain/:address`) | [tokens.md](tokens.md)           |
| Channels (`/kols`)                           | [kols.md](kols.md)               |
| Newsroom (`/feed`)                           | [feed.md](feed.md)               |
| Writer practice room (`/playground`)         | [playground.md](playground.md)   |
| Short-posts screen (`/threads`)              | [threads.md](threads.md)         |
| Grouped views (`/templates`)                 | [templates.md](templates.md)     |
| Market data (`/market-data`)                 | [market-data.md](market-data.md) |
| Scanner (`/dexter`)                          | [dexter.md](dexter.md)           |
| Workshop (`/ops`)                            | [ops.md](ops.md)                 |

## Old addresses that still work

Two old addresses send you to the newsroom automatically: `/profiles`
and `/crypto-news`. They exist only so old saved links do not break.

| Old address    | Where it sends you |
| -------------- | ------------------ |
| `/profiles`    | `/feed`            |
| `/crypto-news` | `/feed`            |

## Missing screens (gaps against the agreed plans)

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
