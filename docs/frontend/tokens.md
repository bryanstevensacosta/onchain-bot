# Coins (`/tokens`, `/tokens/:chain/:address`)

## Coin list (`/tokens`)

**What it is for:** browsing every coin the system has seen, like
flipping through a card file.

**What you see:** a list of coins, each with its name, picture, score
out of 100, and whether it passed or failed the checks. Three tabs let
you see all coins, only the ones that passed, or only the ones that
failed. Clicking a coin opens its detail page (see below).

**Trip you can take here:** open the list → pick the "passed" tab to
see only winners → click a coin to see why it passed.

| What the screen shows                  | Where it gets it from                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coin list (all / passed / failed tabs) | `GET /token/vip-call-approval/decisions/recent`, `GET /token/vip-call-approval/decisions/approved`, `GET /token/vip-call-approval/decisions/rejected` |
| Score next to each coin                | `GET /token/scoring/tokens/recent`                                                                                                                    |
| Coin names                             | `GET /token/normalization/tokens/recent`                                                                                                              |

## Coin detail (`/tokens/:chain/:address`)

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
