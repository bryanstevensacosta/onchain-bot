# Frontend — What the Screens Are For

This file is a pointer. The per-screen docs live in
[`docs/frontend/`](../../docs/frontend/README.md) — one file per route,
written in plain language for anyone, no coding knowledge needed.

The dashboard is the control panel of the whole system. It lets you watch
what is happening, look up past results, manage who you listen to, set up
automatic posting, and fix things by hand when needed.

> The only technical details in those files are web addresses (routes) and
> the list of places each screen gets its information from. Everything
> else is plain language.

## Index

| Screen                                       | File                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Home (`/`)                                   | [`docs/frontend/dashboard.md`](../../docs/frontend/dashboard.md)     |
| Coins (`/tokens`, `/tokens/:chain/:address`) | [`docs/frontend/tokens.md`](../../docs/frontend/tokens.md)           |
| Channels (`/kols`)                           | [`docs/frontend/kols.md`](../../docs/frontend/kols.md)               |
| Newsroom (`/feed`)                           | [`docs/frontend/feed.md`](../../docs/frontend/feed.md)               |
| Writer practice room (`/playground`)         | [`docs/frontend/playground.md`](../../docs/frontend/playground.md)   |
| Short-posts screen (`/threads`)              | [`docs/frontend/threads.md`](../../docs/frontend/threads.md)         |
| Grouped views (`/templates`)                 | [`docs/frontend/templates.md`](../../docs/frontend/templates.md)     |
| Market data (`/market-data`)                 | [`docs/frontend/market-data.md`](../../docs/frontend/market-data.md) |
| Scanner (`/dexter`)                          | [`docs/frontend/dexter.md`](../../docs/frontend/dexter.md)           |
| Workshop (`/ops`)                            | [`docs/frontend/ops.md`](../../docs/frontend/ops.md)                 |

Old addresses `/profiles` and `/crypto-news` redirect to `/feed`
(bookmark shims). Known gaps against the agreed plans are tracked in
[`docs/frontend/README.md`](../../docs/frontend/README.md).

## Conventions for these docs

- One file per route; the file name matches the route (`feed.md` for
  `/feed`, `tokens.md` for `/tokens` + its detail route).
- Each file keeps the same shape: plain-language purpose, what you see,
  the trips you can take, then a routes/APIs table as the only
  technical detail.
- When a route changes, update its file — not this pointer.
