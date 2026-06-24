# Feature — Wallets, Holders & Wallet Stats

> **Resumen (ES):** Inspección on-chain de wallets y holders. Comandos para holders conocidos/notables, stats de cualquier wallet, labels de grupo, import/export de wallets. Disponible en Telegram y Discord. Fuente: [talk.markets/t/known-top-holders-wallet-stats/5066](https://talk.markets/t/known-top-holders-wallet-stats/5066).

---

## What is this?

Rick automatically responds to any **active wallet** pasted in the chat or DMs, and provides a quick insight into the performance & stats of any wallet.

---

## Commands

| Command | Description |
|---|---|
| `/h` | Get known (top) holders |
| `/nh` | Get [notable holders :gem_stone:](https://talk.markets/t/notable-holders/3602) |
| `/w` | Search wallet or label |
| `/wl` | Set wallet label and emoji *(used in reply to a Rick wallet scan)* |
| `/wexport` | Export group wallets in `.txt` format |
| `/wimport` | Import wallets |
| `/wexport wipe` | Clear all labels (owner only) |

---

## Usage

Use `/w <address or label>` in any group or DM with Rick to query the recent performance of that wallet.

Wallets shown in *cursive* with a :gem_stone: emoji (linking to Twitter/𝕏) are public KOL wallets. If you haven't added a label, Rick will label the known KOLs.

You can copy the wallet address by clicking the :clipboard: button on a scan.

---

## Group labels

The `/wl` command labels wallets that are shared in the chat. **Reply** to a wallet response from Rick.

- `/wl <label> <emoji>` — set a label
- Emoji is optional (no current use besides display)
- Labels may contain letters, numbers, and underscores
- Labels also available in [DM](https://t.me/RickBurpBot)
- **No limits** on the amount of wallets you can label

> Telegram only feature.

### Deleting a group label

Scan the wallet and **reply with `/wl del`**.

---

## Importing wallets (BETA)

Use `/wimport` to import a list of wallets. **Max 30 wallets per run.** [To convert exports from platforms like Axiom, use the converter](https://talk.markets/t/wallet-converter-for-imports/7800).

Expected format:

```
wallet1,label_1
wallet2,label_2
```

Two ways to import:

1. Send a `.txt` file with the required format and reply to it with `/wimport`
2. Run `wimport wallet1,label_1 wallet2,label_2` — separated by newlines

---

## Exporting wallets

Quickly export the full wallet list to a widely supported `.txt` file accepted by any wallet tracker/platform. Run `/wexport` in the group to generate the export.

---

## Notable holders

[Notable Holders](https://talk.markets/t/notable-holders-for-solana/3602) — surfaces KOL wallets and addresses flagged as noteworthy (e.g. market makers, snipers, known deployers).

- Telegram: `/nh <token>`
- Discord: `.nh <ca>`

---

## Related

- [Commands on Telegram](./03-commands-telegram.md#wallets--holders)
- [Commands on Discord](./04-commands-discord.md#crypto-commands)
- [Notable Holders for EVM, KOL wallets & token conversions](https://talk.markets/t/notable-holders-for-evm-kol-wallets-token-conversions/7960)
- [Wallet Labels & Deployer History](https://talk.markets/t/wallet-labels-deployer-history/7775)
- [Known (Top) Holders & Bundles](https://talk.markets/t/known-top-holders-bundles/7830)
