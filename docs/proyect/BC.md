# Project Bounded Contexts

## Overview

This document defines all Bounded Contexts (BCs) for the crypto Telegram bot. Each BC is a self-contained module with its own domain model, transactional boundaries, and ubiquitous language.

---

## Bounded Contexts Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    Alpha Meta Token Scanner                       │
├─────────────┬──────────────┬─────────────┬──────────────────────┤
│   Token      │   Trading    │   Alert     │   User               │
│   Context    │   Context    │   Context   │   Context            │
├─────────────┼──────────────┼─────────────┼──────────────────────┤
│   Portfolio  │  Analytics   │  Notification │  Referral          │
│   Context    │  Context     │  Context      │  Context           │
└─────────────┴──────────────┴─────────────┴──────────────────────┘
```

---

# 1. Token Context

**Responsibility**: Resolve, validate, and provide live data for any crypto token.

| Attribute | Value |
|-----------|-------|
| **Domain** | Token discovery and data |
| **DB** | `tokens` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Token** | A crypto asset identified by contract address |
| **Chain** | Blockchain network (Ethereum, Solana, BSC) |
| **Pair** | Trading pair on a DEX (e.g., PEPE/WETH) |
| **Contract Address** | On-chain identifier of the token |
| **Ticker** | Symbol (PEPE, SOL, USDC) |
| **Price** | Current USD price |
| **Liquidity** | Total USD in DEX pools |
| **Market Cap** | Total market capitalization |
| **FDV** | Fully Diluted Valuation |
| **Volume 24h** | Trading volume in last 24 hours |
| **Holders** | Number of unique wallet addresses holding the token |
| **Age** | Time since first pair creation |
| **ATH** | All-Time High price |
| **Top Holders Concentration** | % of supply held by top 10 wallets |
| **Honeypot** | Token that blocks selling |
| **Sell Tax** | Fee charged on sell transactions |
| **GT Score** | GeckoTerminal quality score (0-100) |

## Entities

```typescript
Token {
  id: TokenId
  contractAddress: ContractAddress
  chainId: ChainId
  symbol: Ticker
  name: string
  decimals: number
  totalSupply: bigint
  imageUrl: URL
  socials: SocialLinks
  createdAt: timestamp
}

TokenSnapshot {
  id: SnapshotId
  tokenId: TokenId
  price: USD
  marketCap: USD
  fdv: USD
  liquidity: USD
  volume24h: USD
  priceChange1h: Percentage
  priceChange24h: Percentage
  holders: number
  top10HolderPercent: Percentage
  sellTax: Percentage
  isHoneypot: boolean
  gtScore: number
  recordedAt: timestamp
}

Chain {
  id: ChainId
  name: string
  nativeCurrency: string
  rpcUrl: URL
  explorerUrl: URL
}
```

## Value Objects

```typescript
TokenId      { value: string }
ContractAddress { value: string; chain: ChainId }
ChainId      { value: 'ethereum' | 'solana' | 'bsc' | 'base' | ... }
Ticker       { value: string } // 2-10 uppercase chars
USD          { amount: number }
Percentage   { value: number }
SocialLinks  { website?: URL; twitter?: string; telegram?: string }
SnapshotId   { value: string }
```

## Domain Services

```typescript
TokenResolver {
  // Resolves input to a valid Token
  resolve(input: string): Token
  - If 0x...42 hex → EVM address
  - If Base58 32 bytes → Solana address
  - If 2-10 uppercase → Symbol (search)
}

TokenValidationService {
  validateAddress(address: string): ChainValidation
  checkHoneypot(tokenId: TokenId): HoneypotReport
  calculateRiskScore(token: Token): RiskScore
}
```

## Events

| Event | Payload |
|-------|---------|
| `TokenSearched` | tokenId, chainId, source (address/symbol) |
| `TokenSnapshotTaken` | tokenId, snapshot |
| `HoneypotDetected` | tokenId, score, flags |

## Transactional Boundary

```
Token Context         Token DB (tokens, snapshots, chains)
    │
    └─► Analytics Context (via TokenSearched event)
    └─► Portfolio Context (via TokenSnapshotTaken event)
```

---

# 2. Trading Context

**Responsibility**: Execute and track token swaps, positions, and PnL.

| Attribute | Value |
|-----------|-------|
| **Domain** | Order execution and position management |
| **DB** | `trading` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Order** | A buy or sell instruction for a token |
| **Position** | An open holding in a token |
| **Swap** | Token-to-token exchange via DEX |
| **Entry Price** | Price at which position was opened |
| **Exit Price** | Price at which position was closed |
| **PnL** | Profit and Loss (realized) |
| **Unrealized PnL** | Current profit/loss on open positions |
| **Slippage** | Difference between expected and actual price |
| **Gas** | Transaction fee in native currency |
| **Wallet** | User's connected wallet address |
| **Route** | Series of swaps to execute a trade |

## Entities

```typescript
Order {
  id: OrderId
  userId: UserId
  tokenId: TokenId
  type: OrderType  // BUY | SELL
  amount: TokenAmount
  price: USD
  status: OrderStatus  // PENDING | EXECUTED | FAILED | CANCELLED
  txHash: string | null
  gas: USD
  slippage: Percentage
  executedAt: timestamp | null
  createdAt: timestamp
}

Position {
  id: PositionId
  userId: UserId
  tokenId: TokenId
  entryPrice: USD
  currentPrice: USD
  amount: TokenAmount
  pnl: USD
  pnlPercent: Percentage
  openedAt: timestamp
  updatedAt: timestamp
}

Swap {
  id: SwapId
  fromToken: TokenId
  toToken: TokenId
  fromAmount: TokenAmount
  toAmount: TokenAmount
  price: USD
  route: SwapRoute[]
  txHash: string
  status: SwapStatus
  executedAt: timestamp
}
```

## Value Objects

```typescript
OrderId      { value: string }
PositionId   { value: string }
OrderType    BUY | SELL
OrderStatus  PENDING | EXECUTED | FAILED | CANCELLED
TokenAmount  { value: bigint; decimals: number }
SwapRoute    { dex: DEX; pool: PoolId; steps: SwapStep[] }
SwapStep     { from: TokenId; to: TokenId; via: PoolId }
```

## Domain Services

```typescript
OrderExecutionService {
  executeOrder(order: Order): ExecutionResult
  calculateSlippage(amount: TokenAmount, pool: Pool): Percentage
  findBestRoute(from: TokenId, to: TokenId, amount: TokenAmount): SwapRoute
}

PositionService {
  open(token: TokenId, amount: TokenAmount, price: USD): Position
  close(positionId: PositionId): PnLReport
  calculatePnL(position: Position): PnLReport
}
```

## Events

| Event | Payload |
|-------|---------|
| `OrderExecuted` | orderId, tokenId, txHash, price |
| `OrderFailed` | orderId, reason |
| `PositionOpened` | positionId, tokenId, entryPrice |
| `PositionClosed` | positionId, tokenId, PnL |

## Transactional Boundary

```
Trading Context       Trading DB (orders, positions, swaps)
    │
    ├─► Token Context (read price/quote)
    ├─► Portfolio Context (via PositionOpened/Closed)
    └─► Notification Context (via OrderExecuted/Failed)
```

---

# 3. Alert Context

**Responsibility**: Manage user-defined price alerts and notify when triggered.

| Attribute | Value |
|-----------|-------|
| **Domain** | Price monitoring and alerts |
| **DB** | `alerts` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Alert** | A condition to monitor (e.g., price above X) |
| **Trigger** | The moment an alert condition is met |
| **Condition** | The rule that defines when to fire |
| **Cooldown** | Minimum time between re-triggers |
| **Target Price** | The price at which alert fires |
| **Frequency** | One-time or recurring |

## Entities

```typescript
Alert {
  id: AlertId
  userId: UserId
  tokenId: TokenId
  type: AlertType  // PRICE_ABOVE | PRICE_BELOW | VOLUME_SPIKE | CHANGE_PERCENT
  targetValue: number
  direction: Direction  // ABOVE | BELOW
  status: AlertStatus  // ACTIVE | TRIGGERED | DISABLED
  cooldownMinutes: number
  isRecurring: boolean
  lastTriggeredAt: timestamp | null
  createdAt: timestamp
}

AlertTrigger {
  id: TriggerId
  alertId: AlertId
  triggeredAt: timestamp
  priceAtTrigger: USD
  delivered: boolean
}
```

## Value Objects

```typescript
AlertType    PRICE_ABOVE | PRICE_BELOW | VOLUME_SPIKE | CHANGE_PERCENT
Direction    ABOVE | BELOW
AlertStatus  ACTIVE | TRIGGERED | DISABLED
```

## Domain Services

```typescript
AlertEvaluationService {
  evaluate(alert: Alert, currentSnapshot: TokenSnapshot): boolean
  shouldCooldown(alert: Alert): boolean
}

AlertDispatcher {
  dispatch(trigger: AlertTrigger): void
}
```

## Events

| Event | Payload |
|-------|---------|
| `AlertTriggered` | alertId, userId, tokenId, currentPrice |
| `AlertCreated` | alertId, userId, tokenId, condition |
| `AlertDisabled` | alertId |

## Transactional Boundary

```
Alert Context         Alert DB (alerts, triggers)
    │
    ├─► Token Context (read snapshots for evaluation)
    └─► Notification Context (via AlertTriggered)
```

---

# 4. User Context

**Responsibility**: Manage Telegram users, preferences, and linked wallets.

| Attribute | Value |
|-----------|-------|
| **Domain** | User identity and preferences |
| **DB** | `users` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **User** | A Telegram user interacting with the bot |
| **Chat** | Telegram chat (private or group) |
| **Preference** | Per-user settings (currency, language) |
| **Wallet** | Linked blockchain wallet address |
| **Watchlist** | List of token addresses the user tracks |
| **Credits** | Balance for premium features |

## Entities

```typescript
User {
  id: UserId
  telegramId: number
  telegramUsername: string | null
  firstName: string
  language: Language
  preferences: UserPreferences
  credits: number
  isPremium: boolean
  createdAt: timestamp
  lastActiveAt: timestamp
}

Wallet {
  id: WalletId
  userId: UserId
  address: string
  chainId: ChainId
  label: string | null
  isDefault: boolean
  addedAt: timestamp
}

Watchlist {
  id: WatchlistId
  userId: UserId
  tokens: TokenId[]
  updatedAt: timestamp
}

Chat {
  id: ChatId
  telegramChatId: number
  type: ChatType  // PRIVATE | GROUP | SUPERGROUP
  settings: ChatSettings
}
```

## Value Objects

```typescript
Language     'en' | 'es' | 'zh' | ...
UserPreferences { currency: 'USD' | 'ETH' | 'BTC'; alertsEnabled: boolean }
ChatSettings { rateLimitEnabled: boolean; autoDetect: boolean }
```

## Events

| Event | Payload |
|-------|---------|
| `UserRegistered` | userId, telegramId |
| `WalletLinked` | userId, walletAddress, chainId |
| `WatchlistUpdated` | userId, tokenIds |

## Transactional Boundary

```
User Context          User DB (users, wallets, watchlists, chats)
    │
    ├─► Alert Context (read preferences for alerts)
    └─► Trading Context (read wallets for execution)
```

---

# 5. Portfolio Context

**Responsibility**: Track user holdings, balances, and performance over time.

| Attribute | Value |
|-----------|-------|
| **Domain** | Portfolio tracking and history |
| **DB** | `portfolio` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Portfolio** | Aggregate of all user holdings |
| **Holding** | Balance of a specific token in a wallet |
| **Balance** | Current token amount |
| **Total Value** | USD value of all holdings |
| **P&L** | Profit/loss of the portfolio |
| **Allocation** | % of portfolio per token |
| **History** | Time-series of balance snapshots |

## Entities

```typescript
Holding {
  id: HoldingId
  userId: UserId
  tokenId: TokenId
  walletId: WalletId
  balance: TokenAmount
  costBasis: USD
  currentValue: USD
  pnl: USD
  pnlPercent: Percentage
  updatedAt: timestamp
}

Portfolio {
  userId: UserId
  totalValue: USD
  totalPnl: USD
  totalPnlPercent: Percentage
  holdings: Holding[]
  updatedAt: timestamp
}

PortfolioSnapshot {
  id: SnapshotId
  userId: UserId
  totalValue: USD
  holdings: { tokenId: TokenId; value: USD; percentage: Percentage }[]
  takenAt: timestamp
}
```

## Value Objects

```typescript
Allocation { tokenId: TokenId; percentage: Percentage; value: USD }
Performance { period: '1d' | '7d' | '30d' | 'all'; pnl: USD; pnlPercent: Percentage }
```

## Domain Services

```typescript
PortfolioService {
  calculateTotalValue(holdings: Holding[]): USD
  recalculatePnl(holding: Holding, currentPrice: USD): PnLReport
  getAllocation(portfolio: Portfolio): Allocation[]
}

SnapshotService {
  takeSnapshot(portfolio: Portfolio): PortfolioSnapshot
  getHistory(userId: UserId, period: TimeRange): PortfolioSnapshot[]
}
```

## Events

| Event | Payload |
|-------|---------|
| `PortfolioUpdated` | userId, totalValue, changePercent |
| `SnapshotTaken` | userId, snapshotId |
| `HoldingValueChanged` | userId, tokenId, oldValue, newValue |

## Transactional Boundary

```
Portfolio Context    Portfolio DB (holdings, snapshots)
    │
    ├─► Token Context (read prices for valuation)
    └─► Trading Context (listen for PositionOpened/Closed)
```

---

# 6. Analytics Context

**Responsibility**: Calculate token risk scores, detect honeypots, analyze market data.

| Attribute | Value |
|-----------|-------|
| **Domain** | Token risk and market analysis |
| **DB** | `analytics` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Risk Score** | 0-100 score indicating token safety |
| **Honeypot** | Token designed to block sells |
| **Sell Tax** | % deducted on sell |
| **Buy Tax** | % deducted on buy |
| **Liquidity Lock** | % of LP tokens locked |
| **Holder Concentration** | Top holders % of supply |
| **Mint Authority** | Can new tokens be minted? |
| **Freeze Authority** | Can tokens be frozen? |
| **Simulation** | Fork-based buy/sell test |
| **Volume Anomaly** | Unusual trading pattern |

## Entities

```typescript
RiskReport {
  id: ReportId
  tokenId: TokenId
  overallScore: number  // 0-100 (lower = safer)
  status: 'SAFE' | 'RISKY' | 'HONEYPOT'
  signals: RiskSignal[]
  analyzedAt: timestamp
}

RiskSignal {
  type: SignalType
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  description: string
  score: number
}

HoneypotCheck {
  tokenId: TokenId
  buySimulation: SimulationResult
  sellSimulation: SimulationResult
  buyTax: Percentage
  sellTax: Percentage
  isHoneypot: boolean
  flags: string[]
}
```

## Value Objects

```typescript
SignalType    SELL_REVERT | HIGH_TAX | LP_NOT_LOCKED | HIGH_CONCENTRATION | MINT_EXISTS | PROXY_CONTRACT
SimulationResult { success: boolean; txHash: string; revertReason: string | null; gasUsed: number }
```

## Domain Services

```typescript
RiskAnalysisService {
  calculateRiskScore(tokenId: TokenId): RiskReport
  analyzeSignals(tokenId: TokenId): RiskSignal[]
}

HoneypotDetectionService {
  simulateBuy(tokenId: TokenId): SimulationResult
  simulateSell(tokenId: TokenId): SimulationResult
  checkContract(tokenId: TokenId): ContractAnalysis
  getSellTax(tokenId: TokenId): Percentage
}

LiquidityAnalysisService {
  checkLiquidityLock(tokenId: TokenId): LockInfo
  analyzeOwnership(tokenId: TokenId): OwnershipInfo
}

HolderAnalysisService {
  getHolderConcentration(tokenId: TokenId): HolderDistribution
  detectClusters(tokenId: TokenId): ClusterReport
}
```

## Events

| Event | Payload |
|-------|---------|
| `RiskReported` | tokenId, overallScore, status |
| `HoneypotConfirmed` | tokenId, sellTax, flags |
| `AnomalyDetected` | tokenId, type, description |

## Transactional Boundary

```
Analytics Context    Analytics DB (risk_reports, honeypot_checks)
    │
    ├─► Token Context (read token data)
    └─► Alert Context (anomaly alerts)
```

---

# 7. Notification Context

**Responsibility**: Deliver messages to users via Telegram and other channels.

| Attribute | Value |
|-----------|-------|
| **Domain** | Message delivery and templates |
| **DB** | `notifications` schema/collection |
| **Owner** | Core team |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Notification** | A message delivered to a user |
| **Template** | Reusable message format with variables |
| **Channel** | Delivery method (Telegram, email) |
| **Preference** | Per-user notification settings |
| **Delivery** | Successful transmission of a notification |

## Entities

```typescript
Notification {
  id: NotificationId
  userId: UserId
  type: NotificationType
  title: string
  message: string
  templateId: string | null
  channel: NotificationChannel
  status: 'PENDING' | 'SENT' | 'FAILED'
  sentAt: timestamp | null
  createdAt: timestamp
}

NotificationTemplate {
  id: string
  type: NotificationType
  content: string  // with {{placeholders}}
  parseMode: 'HTML' | 'Markdown'
}
```

## Value Objects

```typescript
NotificationType  ALERT | TRADE_EXECUTED | POSITION_UPDATE | WELCOME | REPORT
NotificationChannel TELEGRAM | EMAIL | PUSH
```

## Domain Services

```typescript
NotificationService {
  send(userId: UserId, type: NotificationType, data: Record<string, unknown>): void
  renderTemplate(template: NotificationTemplate, data: Record<string, unknown>): string
}

TelegramDispatcher {
  sendMessage(chatId: number, message: string, parseMode: string): DeliveryResult
  sendPhoto(chatId: number, photo: URL, caption: string): DeliveryResult
}
```

## Events

| Event | Payload |
|-------|---------|
| `NotificationSent` | notificationId, userId, type, status |

## Transactional Boundary

```
Notification Context   Notification DB (notifications, templates)
    │
    ├─► User Context (read preferences)
    └─ (receives from all other BCs)
```

---

# 8. Referral Context

**Responsibility**: Manage referral links, tracking, and rewards.

| Attribute | Value |
|-----------|-------|
| **Domain** | User referrals and incentives |
| **DB** | `referrals` schema/collection |
| **Owner** | Core team |

## Entities

```typescript
ReferralCode {
  id: ReferralCodeId
  userId: UserId
  code: string
  usageCount: number
  rewardEarned: USD
  createdAt: timestamp
}

Referral {
  id: ReferralId
  referrerId: UserId
  referredId: UserId
  code: string
  status: 'PENDING' | 'CONFIRMED'
  rewardAmount: USD
  createdAt: timestamp
}
```

---

# Context Dependency Graph

```
                    ┌─────────────┐
                    │    User     │
                    │   Context   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
         ▼                 ▼                  ▼
  ┌──────────┐    ┌──────────────┐    ┌────────────┐
  │  Alert   │    │   Trading    │◄───│ Portfolio  │
  │ Context  │    │   Context    │    │  Context   │
  └────┬─────┘    └──────┬───────┘    └─────┬──────┘
       │                 │                  │
       │                 ▼                  │
       │          ┌───────────┐            │
       │          │   Token   │◄───────────┘
       ├──────────┤  Context  │
       │          └─────┬─────┘
       │                │
       ▼                ▼
  ┌──────────┐   ┌────────────┐
  │   Notif  │   │ Analytics  │
  │  Context │   │  Context   │
  └──────────┘   └────────────┘
```

---

# Transactional Boundaries Summary

| BC | Database | Owns Data | Reads From |
|----|----------|-----------|------------|
| Token | `tokens` | Tokens, snapshots, chains | External APIs |
| Trading | `trading` | Orders, positions, swaps | Token, User |
| Alert | `alerts` | Alerts, triggers | Token, User |
| User | `users` | Users, wallets, watchlists | Telegram |
| Portfolio | `portfolio` | Holdings, snapshots | Token, Trading |
| Analytics | `analytics` | Risk reports, checks | Token |
| Notification | `notifications` | Notifications, templates | All BCs |
| Referral | `referrals` | Referrals, codes | User |

---

# BC Communication Matrix

| From \ To | Token | Trading | Alert | User | Portfolio | Analytics | Notif |
|-----------|-------|---------|-------|------|-----------|-----------|-------|
| Token | — | Price data | — | — | — | Token data | — |
| Trading | Quote | — | — | Wallet | Positions | — | Trade result |
| Alert | Snapshots | — | — | Prefs | — | — | Alert fired |
| User | — | — | Config | — | Watchlist | — | — |
| Portfolio | Price | Positions | — | — | — | — | Portfolio summary |
| Analytics | Token info | — | — | — | — | — | Risk report |
| Notif | — | — | — | — | — | — | — |
| Referral | — | — | — | User | — | — | — |
