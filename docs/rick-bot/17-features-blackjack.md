# Feature — Blackjack (for fun)

> **Resumen (ES):** Juego de blackjack contra Rick, con créditos "burps" (sin valor monetario real). Soporta side bet Perfect Pairs y jackpot progresivo. Disponible solo en Telegram. Fuente: [talk.markets/t/blackjack-for-fun/8440](https://talk.markets/t/blackjack-for-fun/8440).

> Blackjack uses **burps**, not AI credits. You can't run out of AI credits by playing, and you can't run out of burps by AI interactions.

---

## What is Blackjack?

A fun-money card game played against Rick. Every hand is paid in **burps** — Rick's **fun-credit economy** that is **separate from AI credits** and has **no real-world value**.

---

## Commands

| Command | Description |
|---|---|
| `/bj <bet>` | Start a hand with the given bet |
| `/bj <bet> side <optional_amount>` | Start a hand + Perfect Pairs side bet (defaults to 10% of main if no amount) |
| `/bj <bet> pp <optional_amount>` | Alias for `side` |
| `/bank` | Auto-claim daily burps + see balance, bank stats & jackpot |
| `/bank top` | Top 10 richest players leaderboard |

> Group admins can disable Blackjack commands with `/games off`.

---

## Getting started

Every user gets **25,000 burps every 24 hours** for free — run `/bank` to claim. The command shows your balance, lifetime claimed, all-time high, last hand played, and the current state of Rick's bank.

New users start at zero — hit `/bank` to grab your first stake.

---

## Placing a bet

Bets accept shorthand formats. **Minimum bet: 1,000 burps.**

- `/bj 1000`
- `/bj 1k`

---

## Table rules

Rick runs a clean table, no shady dealer tricks:

- **6-deck shoe**, reshuffled fresh every hand
- **Dealer stands on all 17s** (S17, including soft 17)
- **Blackjack pays 3:2**
- **Double** on any two cards, including after a split
- **Split** any pair, but only once (max 2 hands per session)
- **Split aces** get exactly one card each; 21 on split-ace is **not** blackjack
- **No insurance, no surrender**

---

## Playing a hand

After `/bj <bet>`, Rick deals two cards to you and two to himself (one hidden). Inline buttons appear:

- :oncoming_fist: **Hit** — take another card
- :raised_hand: **Stand** — lock in your total
- :fast_up_button: **Double** — double bet, take exactly one card, auto-stand *(fresh 2-card hand only)*
- :scissors: **Split** — split a pair, each gets its own card *(pairs only, once)*

When the hand ends, the dealer reveals the hole card and plays out. Payouts happen instantly.

> Only the player who started the hand can press its buttons. If you see someone else's game, wait your turn.

---

## Side bet — Perfect Pairs

Optional side wager that resolves on your **first two dealt cards**. Independent of the main hand.

**Syntax**

- `/bj 1k side` — side bet defaults to 10% of main, floored at 100, capped at 25,000
- `/bj 1k side 500` — explicit side amount
- `/bj 1k pp 500` — `pp` is an alias for `side`

**Limits**

- Min side bet — **100** burps
- Max side bet — **25,000** burps
- Side bet **capped at the main bet**

**Payouts** (profit multiplier, stake added back on a win)

| Outcome | Example | Pays |
|---|---|---|
| **Perfect pair** (same rank, same suit) | 7♥ + 7♥ | **25:1** |
| **Colored pair** (same rank, same color, different suit) | 7♥ + 7♦ | **12:1** |
| **Mixed pair** (same rank, different colors) | 7♥ + 7♣ | **6:1** |
| No pair | 7♥ + 9♠ | lose |

> The side bet resolves **independently** of the main hand. You can lose the main and still cash a 25:1 side bet (or vice versa).

---

## The Jackpot

Every bet feeds a **shared progressive jackpot** that can drop on any qualifying hand.

- **3%** of every wager flows into the pool
- **Min bet of 10,000 burps** to be eligible
- **1/100 chance** per qualifying hand (rolled at hand end, win or lose)
- The **entire pot** goes to the winner; pool resets to zero
- Current pool size visible at the bottom of `/bank`

> You can win the jackpot **even when you lose the hand**. The roll is independent of your cards.

---

## After the hand

- :repeat_button: **Deal** — redeal with the same bet
- :fast_up_button: **Deal 2x** — redeal with double the bet

Between hands there's a **15-second cooldown**; buttons have a 3-second throttle to prevent rate limiting.

---

## Notes

- Inactive hands expire after 5 minutes (bet lost).
- **One active hand per player** across all chats.
- **One active hand per chat** — wait if someone else is mid-hand.

---

## FAQ

### What if I run out of burps?

Run `/bank` to claim your daily 25k. If on cooldown, the command tells you when your next claim unlocks.

### Where do my winnings come from?

Rick's bank. When he gets drained below zero, he auto-refills. `/bank` shows a :skull_and_crossbones: **rekt counter** crediting whoever tipped him over.

### Can the house go bust?

Technically yes, but Rick auto-refills so the table never closes. Draining Rick is the flex — your username goes on the rekt board.

### Why doesn't my bet fully go to Rick?

3% is skimmed off every bet into the jackpot pool. Rick still gets the rest.

### Does the side bet feed the jackpot?

Only the **main bet** counts toward the 3% jackpot skim and the 10k eligibility floor. Side bets settle separately.

---

## Disclaimer

> Blackjack is a **fun-money** game using burps. These have **no monetary value** and **cannot be cashed out**. Play for the culture, not the bag.

---

## Related

- [Commands on Telegram — Fun, games & rep](./03-commands-telegram.md#fun-games--reputation)
- [Premium & Credits](./05-premium.md)
