# Automatic Input Detection

The bot **does not require a `/token` command**. Any message that contains a potential token identifier will be parsed automatically. The detection pipeline runs before any command handling.

## Detection Flow

1. **Message received** – raw Telegram text.
2. **Fast format filter**
   - `0x…` + 40 hex → possible **EVM address**
   - Base58 decoded = 32 bytes → possible **Solana address**
   - Upper‑case 2‑10 chars → possible **ticker symbol**
3. **Parallel RPC probes** (optional, PRO mode)
   - `eth_getCode` / `eth_getBalance` for EVM
   - `getAccountInfo` / `getBalance` for Solana
4. **Scoring & confidence** (see `docs/api/chain-detection.md`).
5. **Result** → `{type: 'address'|'symbol', chain: 'evm'|'solana', confidence}`
6. **If confidence ≥ 0.8** the bot treats the message as a token query and runs the full token‑scan flow (price, FDV, holders, etc.).
7. **Otherwise** the bot replies with a help hint or ignores the message depending on group settings.

## Example Messages

- `0x6982508145454Ce325dDbE47a25d4ec3d2311933` → detected as EVM address, chain = `evm`.
- `PEPE` → ticker symbol, resolved via Symbol Resolution (see `docs/api/symbol-resolution.md`).
- `0xABC123` → fails length check → bot responds with a short help message.
- `Check out SOL` → contains whitespace → classified as **query** → ignored for token scans.

## Configuration Flags (bot settings)

| Flag | Description | Default |
|------|-------------|---------|
| `autoDetect` | Enable automatic parsing of any message. | `on` |
| `minConfidence` | Minimum confidence (0‑1) to trigger a token scan. | `0.8` |
| `groupMode` | Show group‑level data in the footer when auto‑detect is on. | `on` |

## Implementation References

- **Chain detection** – `src/chain/detection.js`
- **Symbol resolver** – `src/utils/symbolResolver.js` (uses `docs/api/symbol-resolution.md`)
- **Message handler** – `src/bot/handlers/autoDetect.js` (new file to be added).

## Quick‑Start for Developers

1. Ensure `autoDetect` is set to `true` in `.env` or `config/index.js`.
2. Add the new handler to `src/bot/setup.js`:
```javascript
bot.on('message', autoDetectHandler);
```
3. The handler will call `detectChain(input)` (see `chain/detection.js`) and, on success, invoke `TokenService.orchestrate()`.

---

**Note:** The traditional `/token` command remains available for backward compatibility but is not required for normal operation.
