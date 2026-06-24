# Feature — Custom Trade Buttons (`/tb`)

> **Resumen (ES):** Configura qué botones de trading/analytics aparecen en los scans de tokens. Soporta 20+ plataformas (Axiom, Photon, Trojan, Maestro, etc.) + herramientas de análisis (BubbleMaps, DexScreener, Defined, etc.). Funciona en Telegram y Discord. Fuente: [talk.markets/t/custom-trade-buttons/7214](https://talk.markets/t/custom-trade-buttons/7214).

---

## What are Custom Trade Buttons?

Trade buttons let you quickly access **trading platforms** and **analysis tools** directly from token scans. Configure which platforms appear and where they're positioned with the `/tb` command.

> Available on both Telegram and Discord.

---

## Commands

| Command | Description |
|---|---|
| `/tb` | Show current settings and help |
| `/tb on` | Enable default trade buttons |
| `/tb PHO AXI TRO` | :puzzle_piece: **Custom selection** — pick platforms by code |
| `/tb off` | Disable all trade buttons |
| `/tb top` | Position above other buttons |
| `/tb bot` | Position below other buttons (default) |
| `/tb 4` | Set display limit (1–6 on Telegram, 1–4 on Discord — default 3) |
| `/buttons on/off` | Toggle [refresh buttons on Rick](https://talk.markets/t/new-refresh-buttons-on-rick/7006) |

> Telegram: displaying more than **4** buttons increases width and may look cluttered.
> Discord: display limit is **4** to prevent mobile overflow (one row split in two rows).

---

## Supported trading platforms

There is **no limit** on how many you can configure, but only the first 3 (default) are shown.

Example:
- Configure `/tb AXI PHO PDR MAE BAN` → first 3 show for Solana.
- Query an AVAX token → only Maestro shows (chain-specific).
- Query an ETH token → Photon, Maestro, BananaGun show.

| Code | Platform |
|---|---|
| `AXI` | [Axiom](https://axiom.trade/@rick) |
| `PHO` | [Photon](https://photon-sol.tinyastro.io/@RickBurpBot) |
| `GMG` | [GMGN](https://gmgn.ai/meme/LbosYDck?chain=sol) |
| `GMGTG` | [GMGN on Telegram](https://t.me/gmgnaibot?start=i_LbosYDck) |
| `TRO` | [Trojan](https://t.me/solana_trojanbot?start=r-rickbot) |
| `TRT` | [Trojan Terminal](https://trojan.com/@rick) |
| `BNK` | [BonkBot](https://t.me/bonkbot_bot?start=ref_rickbot) |
| `CLO` | [Cielo Terminal](https://app.cielo.finance/r/rick) |
| `JUP` | [Jupiter](https://jup.ag/?refId=6pfiell69imt) |
| `FMO` | [Fomo](https://fomo.family/r/RICK) |
| `OKX` | [OKX Web3](https://web3.okx.com/ul/joindex?ref=RICKBOT) |
| `TEL` | [Telemetry by BonkBot](https://app.telemetry.io/@rickbot) |
| `VYP` | [Vyper](https://vyper.trade/@rick) |
| `BAN` | [BananaGun](https://t.me/BananaGunSniper_bot?start=ref_RickSanchez) |
| `BSD` | [Based Bot](https://t.me/based_eth_bot?start=r_Rick) |
| `BBW` | [Based Bot Web](https://basedbot.app?ref=Rick) |
| `PRO` | [Maestro](https://t.me/maestro?start=r-rickburpbot) Pro |
| `MAE` | [Maestro](https://t.me/maestro?start=r-rickburpbot) |
| `SGM` | [Sigma](https://t.me/Sigma_buyBot?start=ref=450463357) |
| `MVX` | [MEVX](https://mevx.io/@RickBot) |
| `MVXTG` | [MEVX on Telegram](https://t.me/Mevx?start=RickBot) |
| `STB` | [SolTradingBot](https://t.me/SolTradingBot?start=yqC7cGy1T) |
| `PDR` | [Padre](https://trade.padre.gg/rk/rick) |
| `PEP` | [PepeBoost](https://t.me/pepeboost_sol_bot?start=ref_0xRick) |
| `BLO` | [Bloom](https://t.me/BloomSolana_bot?start=ref_RickBot) |
| `SHU` | [Shuriken](https://t.me/ShurikenTradeBot?start=ref-MentionLux) |
| `BIN` | [Binance](https://accounts.binance.com/en/register?ref=VEURIJ5P) Wallet |
| `RDF` | [ReDefined](https://re.defined.fi/signup?ref=VZ7L2&utm_source=rick&utm_medium=bots&utm_campaign=telegram&invite=RICKBOT) (early access) |

---

## Analysis tools

| Code | Platform |
|---|---|
| `HUB` | [Rick Hub](./10-features-hub.md) (use `HUBW` for Web instead of Telegram Mini App) |
| `BM` | BubbleMaps |
| `TR` | TrenchRadar |
| `DEF` | Defined |
| `DEX` | DexScreener |
| `MOB` | MobyScreener |
| `DT` | DexTools |
| `FAR` | Search Farcaster for Base tokens |

---

## Related

- [Commands on Telegram](./03-commands-telegram.md#general-2) — `/tb` and `/buttons` settings
- [Settings (Pricebot)](./03-commands-telegram.md#pricebot)
- [Quick Start Telegram](./01-quickstart-telegram.md)
