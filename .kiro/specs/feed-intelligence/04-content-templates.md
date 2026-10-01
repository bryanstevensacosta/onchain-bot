# Templates de Contenido Agregado

**Documento**: 04-content-templates.md  
**Fecha**: 2026-09-25  
**Versión**: 1.0

## 📊 Análisis de Datos de Producción

### Estado Actual (Oracle VPS)

**Base de datos**: `alpha_meta_token_scanner_ingestion`  
**Tabla**: `telegram_feed_messages`  
**Período**: 72h retention activo

**Volumen**:

- Total mensajes: 291 (snapshot 2026-09-25)
- **~65 mensajes/día**
- **Top 5 fuentes**:
  1. Watcher Guru — 19 msgs/día (breaking news)
  2. Cointelegraph — 17 msgs/día (established media)
  3. Shoal Research Hub — 15 msgs/día (research)
  4. Lookonchain — 11 msgs/día (on-chain analytics)
  5. unfolded. DeFi — 3 msgs/día (DeFi analysis)

### Patrones Detectados

**1. Breaking News Format (40%)**:

- Prefijos: `JUST IN:`, `BREAKING:`, `🚨`
- Emojis de banderas: 🇺🇸, 🇨🇳, 🇪🇺
- Referencias a entidades: Trump, Xi, Citi, Binance
- Longitud promedio: 100-150 chars

**2. On-Chain Activity (25%)**:

- Whale tracking (portfolio movements, rankings)
- Token mentions: $TOKEN format
- Portfolio values: "$1M in 24 hours"
- Enlaces externos: blockchain explorers, analytics

**3. Regulatory/Legal (20%)**:

- Keywords: SEIZES, ALLEGEDLY, REGULATION
- Instituciones: SEC, CFTC, EU regulators
- Fuentes citadas: FT, Bloomberg, WSJ

**4. Market Analysis (15%)**:

- Instituciones financieras: Citi, Goldman, JPM
- Recomendaciones: "buy", "sell", "pullback"
- Métricas: price targets, market cap

**Distribución de media**:

- 70% solo texto
- 30% con media (principalmente 1 imagen)
- Videos: <5%

## 📰 Templates Prioritizados

### Template 1: Hourly Highlights ⭐⭐⭐ (with Cluster Synthesis)

**Priority**: Phase 1 (MVP)

**Especificaciones**:

- **Frecuencia**: Cada hora (00 minutes)
- **Límite**: Top 5 noticias
- **Score mínimo**: 70/100
- **Ventana temporal**: Última hora
- **Categorías incluidas**: Todas excepto SPAM, GENERAL_NEWS
- **Cluster Synthesis**: Enabled (merge duplicates con LLM)

**Ejemplo SIN Synthesis** (v1.0 behavior):

```markdown
📰 **Top Crypto News** — Last Hour

🚨 **1.** US SEIZES $84M FROM MONTANA PAYMENTS FIRM CAPSTONE
_Regulation · 95 relevance · Shoal Research Hub_

🐋 **2.** Bonk Guy portfolio up $1M in 24h
_Whale Activity · 88 relevance · Lookonchain_

💰 **3.** $2.8 trillion Citi recommends buying pullback
_Market Analysis · 82 relevance · Watcher Guru_
```

**Ejemplo CON Synthesis** (v2.0 — SAME input, 3 similar messages merged):

```markdown
📰 **Top Crypto News** — Last Hour

🚨 **1.** US Government seized $84M from Montana-based payments firm Capstone, which
allegedly processed hundreds of millions of dollars for Tether and Bitfinex through
Caribbean bank Eqibank. The Financial Times reports this is part of a broader investigation
into stablecoin payment infrastructure, with authorities examining whether proper AML
procedures were followed. _[Synthesized from 3 sources: Shoal Research, Cointelegraph,
Watcher Guru between 13:15-13:42 UTC]_
_Regulation · 95 relevance_

🐋 **2.** Bonk Guy (@theunipcs) maintains #1 position on FOMO leaderboard with portfolio
gains exceeding $1M in past 24 hours, holding positions in $PONS, $USELESS, and $MarsCoin
without taking profits despite significant price volatility.
_Whale Activity · 88 relevance · Lookonchain_

💰 **3.** $2.8 trillion Citi says investors should buy the next US stock market pullback.
_Market Analysis · 82 relevance · Watcher Guru_
```

**Synthesis Process**:

```
Input cluster (3 messages, 07:15-07:42):
  A (07:15): "US SEIZES $84M FROM CAPSTONE" (Shoal Research)
  B (07:28): "Montana firm Capstone processed millions for Tether via Eqibank: FT" (Cointelegraph)
  C (07:42): "Feds investigate Tether payment processor over AML violations" (Watcher Guru)

LLM Prompt:
  "Sintetiza las siguientes 3 noticias relacionadas en un único párrafo.
  Incluye TODA la información relevante sin repetir.
  Máximo 120 palabras."

Output:
  "US Government seized $84M from Montana-based payments firm Capstone, which
  allegedly processed hundreds of millions of dollars for Tether and Bitfinex
  through Caribbean bank Eqibank. The Financial Times reports this is part of
  a broader investigation into stablecoin payment infrastructure, with
  authorities examining whether proper AML procedures were followed."
```

**Template Config**:

```json
{
  "name": "Hourly Highlights + Synthesis",
  "type": "highlights",
  "enabled": true,
  "config": {
    "schedule": {
      "cron": "0 * * * *"
    },
    "filters": {
      "minScore": 70,
      "excludeCategories": ["spam", "general_news"],
      "maxAgeHours": 1
    },
    "content": {
      "limit": 5,
      "groupByCategory": false
    },
    "clusterSynthesis": {
      "enabled": true,
      "minClusterSize": 2,
      "maxTokens": 120,
      "preserveTimestamps": true,
      "includeSourceAttribution": true
    }
  }
}
```

**Original format (v1.0, sin synthesis — deprecated)**:

```markdown
📰 **Top Crypto News** — Last Hour

🚨 **1.** US SEIZES $84M FROM MONTANA PAYMENTS FIRM CAPSTONE, ALLEGEDLY MOVING
HUNDREDS OF MILLIONS FOR TETHER AND BITFINEX VIA CARIBBEAN BANK EQIBANK: FT
_Regulation · 95 relevance · Shoal Research Hub_

🐋 **2.** Bonk Guy (@theunipcs) remains firmly at #1 on the FOMO leaderboard, with
his portfolio up over $1M in the past 24 hours. Holds $PONS, $USELESS, $MarsCoin.
_Whale Activity · 88 relevance · Lookonchain_

💰 **3.** $2.8 trillion Citi says investors should buy the next US stock market pullback.
_Market Analysis · 82 relevance · Watcher Guru_

🚀 **4.** Tether walked away from Europe's MiCA stablecoin framework over a single rule
forcing 60% reserves into commercial bank deposits.
_Regulation · 78 relevance · Shoal Research Hub_

⚖️ **5.** CFTC warns "mention markets" (betting on what someone will say/do) carry high
risk of manipulation. Issues new guidance limiting exchange listings.
_Regulation · 75 relevance · Watcher Guru_

_Analyzed 12 messages from 5 sources in the last hour_
```

**Use Case**:

```typescript
// Scheduler: every hour
@Cron(CronExpression.EVERY_HOUR)
async generateHourlyHighlights(): Promise<void> {
  const digest = await this.generateDigestUseCase.execute({
    template: DigestTemplate.HOURLY_HIGHLIGHTS,
    timeWindow: { hours: 1 },
    limit: 5,
    minRelevanceScore: 70,
    excludeCategories: [NewsCategory.SPAM, NewsCategory.GENERAL_NEWS],
  });

  await this.digestRepo.save(digest);
  this.logger.log(`Hourly highlights: ${digest.entries.length} entries`);
}
```

**Publisher integration**:

```typescript
// Content-Publisher: every hour at :02 (2 min offset)
@Cron('2 * * * *')
async publishHourlyHighlights(): Promise<void> {
  const digest = await this.intelligenceClient.getLatestDigest({
    template: 'hourly_highlights',
  });

  if (digest && digest.entries.length >= 3) {
    await this.publishUseCase.execute({
      content: digest.content,
      chatId: process.env.CRYPTO_NEWS_CHANNEL_ID,
    });
  }
}
```

---

### Template 2: Breaking News Alert ⭐⭐⭐

**Priority**: Phase 1 (MVP)

**Especificaciones**:

- **Frecuencia**: Cada 15 minutos (conditional)
- **Límite**: Top 3 urgentes
- **Score mínimo**: 85/100 (high threshold)
- **Ventana temporal**: Últimos 15 minutos
- **Categorías requeridas**: HACK_EXPLOIT, REGULATION, LISTING (tier-1)

**Formato rendered**:

```markdown
🚨 **BREAKING CRYPTO NEWS** — 13:45 UTC

⚠️ **URGENT**: US Government seizes $84M from Tether payment processor Capstone

The Montana-based firm allegedly moved hundreds of millions via Caribbean bank Eqibank
for Tether and Bitfinex operations.

_Source: Shoal Research Hub (Financial Times)_
_Impact: High — Major stablecoin infrastructure_
_Category: Regulation · Confidence: 98%_

---

🏦 **Tether exits Europe's MiCA compliance framework**

CEO Paolo Ardoino cites 60% bank deposit requirement as "uninsurable risk" for 400M users.
USDT delisted from EU exchanges July 1, won't return until MiCA changes.

_Source: Shoal Research Hub_
_Impact: High — Stablecoin regulation_
_Category: Regulation · Confidence: 95%_

---

⚖️ **CFTC issues new guidance restricting "mention markets"**

Prediction markets betting on specific statements/actions now face limitations. High
manipulation risk cited as reason for regulatory intervention.

_Source: Watcher Guru_
_Impact: Medium — Derivatives regulation_
_Category: Regulation · Confidence: 88%_
```

**Scheduler logic**:

```typescript
@Cron(CronExpression.EVERY_15_MINUTES)
async checkBreakingNews(): Promise<void> {
  const digest = await this.generateDigestUseCase.execute({
    template: DigestTemplate.BREAKING_NEWS,
    timeWindow: { minutes: 15 },
    limit: 3,
    minRelevanceScore: 85,
    requiredCategories: [
      NewsCategory.HACK_EXPLOIT,
      NewsCategory.REGULATION,
      NewsCategory.LISTING,
    ],
  });

  if (digest.entries.length > 0) {
    await this.digestRepo.save(digest);
    // Optional: trigger immediate push notification
    await this.notificationService.sendBreakingNews(digest);
    this.logger.warn(`🚨 Breaking news: ${digest.entries.length} items`);
  }
}
```

**Impact levels** (metadata):

```typescript
enum ImpactLevel {
  CRITICAL = 'critical', // Score >= 95, immediate notification
  HIGH = 'high', // Score >= 90
  MEDIUM = 'medium', // Score >= 85
}

function computeImpact(score: number, category: NewsCategory): ImpactLevel {
  if (category === NewsCategory.HACK_EXPLOIT && score >= 95) {
    return ImpactLevel.CRITICAL;
  }
  if (score >= 90) return ImpactLevel.HIGH;
  if (score >= 85) return ImpactLevel.MEDIUM;
  return null; // No breaking news
}
```

---

### Template 3: Daily Digest ⭐⭐

**Priority**: Phase 2

**Especificaciones**:

- **Frecuencia**: Diario a las 8:00 AM UTC
- **Límite**: Top 10 agrupadas por categoría
- **Score mínimo**: 60/100
- **Ventana temporal**: Últimas 24 horas
- **Agrupación**: Por categoría con subsecciones

**Formato rendered**:

```markdown
📊 **Daily Crypto Digest** — September 25, 2026

🚨 **SECURITY & REGULATION** (3)

1. US SEIZES $84M FROM MONTANA PAYMENTS FIRM CAPSTONE — Allegedly moving hundreds of
   millions for Tether/Bitfinex via Caribbean bank. (Shoal Research · 95 relevance)

2. Tether exits Europe's MiCA framework over 60% bank deposit rule — CEO Ardoino says
   rule puts 400M users at risk, only €100K insured. (Shoal Research · 92 relevance)

3. CFTC warns "mention markets" carry high manipulation risk — New guidance limits
   exchange listings for prediction markets. (Watcher Guru · 78 relevance)

🐋 **WHALE ACTIVITY** (2)

1. Bonk Guy portfolio up $1M in 24h — Holds $PONS, $USELESS, $MarsCoin without taking
   profits. Ranks #1 on FOMO leaderboard. (Lookonchain · 88 relevance)

2. Major wallet moved 50K ETH to Coinbase — Potentially signaling sell pressure.
   (Lookonchain · 72 relevance)

💰 **MARKET ANALYSIS** (3)

1. Citi ($2.8T AUM) recommends buying next market pullback — Institutional bullish signal.
   (Watcher Guru · 82 relevance)

2. Bitcoin on-chain metrics show accumulation phase — Addresses holding >1 BTC up 5% WoW.
   (Glassnode · 75 relevance)

3. Altcoin season index reaches 67 — Historical signal for alt rally.
   (CryptoRank · 68 relevance)

🚀 **LISTINGS & PRODUCTS** (2)

1. Binance to list $TOKEN perpetual futures — Trading starts Oct 1.
   (Cointelegraph · 85 relevance)

2. Coinbase adds 5 new tokens to roadmap — Including $OP, $ARB ecosystem plays.
   (Coin Bureau · 70 relevance)

---

**Stats**: Analyzed 65 messages from 8 sources over 24 hours
**Categories**: 5 represented (Security 30%, Whale 20%, Market 30%, Listing 20%)
**Avg Relevance**: 79/100
```

**Renderer implementation**:

```typescript
private renderDailyDigest(digest: NewsDigest): string {
  const header = `📊 **Daily Crypto Digest** — ${format(digest.timeWindowStart, 'MMMM dd, yyyy')}\n\n`;

  // Group by category
  const grouped = groupBy(digest.entries, (e) => e.classification.category);

  const sections = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)  // Sort by entry count DESC
    .map(([category, entries]) => {
      const emoji = this.getCategoryEmoji(category as NewsCategory);
      const title = `${emoji} **${this.getCategoryDisplayName(category)}** (${entries.length})\n\n`;
      const items = entries.map((e, idx) =>
        `${idx + 1}. ${e.message.content.substring(0, 120)}... (${e.message.sourceName} · ${e.relevanceScore} relevance)`
      ).join('\n\n');
      return title + items;
    })
    .join('\n\n');

  const stats = `\n\n---\n\n**Stats**: Analyzed ${digest.metadata.totalMessagesAnalyzed} messages from ${digest.metadata.sourcesIncluded.length} sources over 24 hours\n` +
    `**Categories**: ${digest.metadata.categoriesIncluded.length} represented\n` +
    `**Avg Relevance**: ${Math.round(digest.metadata.avgRelevanceScore)}/100`;

  return header + sections + stats;
}
```

---

### Template 4: Story Updates Narrative ⭐⭐⭐ (NEW v2.0)

**Priority**: Phase 5

**Especificaciones**:

- **Frecuencia**: Diario a las 9:00 AM UTC
- **Límite**: Top 10 historias activas con updates
- **Score mínimo**: 60/100
- **Ventana temporal**: Últimas 72 horas
- **Story tracking enabled**: Detecta updates, timeline, síntesis

**Formato rendered**:

```markdown
📖 **Developing Stories** — September 25, 2026

---

📰 **Story Update**: Tether-MiCA Exit

**Latest** (Sep 25, 14:30 UTC):
European exchanges began delisting USDT following Tether's exit from the MiCA compliance
framework. Major platforms including Kraken EU and Bitstamp confirmed they will remove
USDT trading pairs by October 1st.

**New Information**:

- Kraken EU delists USDT October 1
- Bitstamp follows suit
- Estimated €2B USDT volume affected

**Story So Far**:
Tether announced its departure from Europe's Markets in Crypto-Assets (MiCA) regulatory
framework on September 22, citing the requirement to hold 60% of reserves in commercial
bank deposits as an "uninsurable risk" for its 400M users. CEO Paolo Ardoino explained
that with EU deposit insurance limited to €100K, the rule would put billions at systemic
risk. Following the announcement, Tether confirmed it has no plans to return to EU markets
until MiCA requirements change. Now, major European exchanges are taking action to comply
with the new regulatory landscape.

**Timeline** (3 total updates):
🆕 **Sep 22, 08:00** — Tether announces exit from MiCA framework, cites 60% bank deposit...
📈 **Sep 23, 10:15** — Tether CEO confirms no plans to return to EU until rules change...
📈 **Sep 25, 14:30** — European exchanges began delisting USDT following Tether's exit...

_Tracking since Sep 22, 2026_

---

📰 **Story Update**: KelpDAO-LayerZero Legal Battle

**Latest** (Sep 25, 11:20 UTC):
LayerZero Labs filed a motion to dismiss the KelpDAO lawsuit, arguing that the exploit
was caused by KelpDAO's own smart contract vulnerabilities, not LayerZero's messaging
protocol. Legal experts say this could set a precedent for protocol liability in DeFi.

**New Information**:

- LayerZero files motion to dismiss
- Argument: KelpDAO's contract bugs, not protocol issue
- Could set precedent for DeFi protocol liability

**Story So Far**:
KelpDAO filed a $50M lawsuit against LayerZero on September 23, claiming the cross-chain
messaging protocol's vulnerability enabled an exploit that drained $50M from its liquid
staking pools. The lawsuit alleges LayerZero failed to implement proper security audits.
Analysts noted this would be the largest DeFi legal case of 2026 if it proceeds. Now,
LayerZero has responded with a motion to dismiss, shifting blame to KelpDAO's own
implementation and raising fundamental questions about liability in composable DeFi
protocols.

**Timeline** (2 total updates):
🆕 **Sep 23, 07:00** — KelpDAO files $50M lawsuit against LayerZero over exploit...
📈 **Sep 25, 11:20** — LayerZero Labs filed a motion to dismiss the KelpDAO lawsuit...

_Tracking since Sep 23, 2026_

---

[... 8 more active stories ...]

---

**Stats**: 10 active stories tracked | Avg 2.4 updates per story | 72h window
**Categories**: Regulation 40%, Legal 30%, Security 20%, Market 10%
```

**Template Config**:

```json
{
  "name": "Active Stories Digest",
  "type": "narrative",
  "enabled": true,
  "config": {
    "schedule": {
      "cron": "0 9 * * *"
    },
    "filters": {
      "minScore": 60,
      "maxAgeHours": 72,
      "categories": null
    },
    "content": {
      "limit": 10,
      "groupByCategory": false,
      "includeSummary": false
    },
    "storyTracking": {
      "enabled": true,
      "includeHistory": true,
      "maxUpdatesShown": 3,
      "highlightLatest": true,
      "synthesizeHistory": true
    }
  }
}
```

**Use Case**:

```typescript
// Scheduler: daily at 9 AM
@Cron('0 9 * * *')
async generateStoriesDigest(): Promise<void> {
  // 1. Get all active stories from last 72h
  const activeStories = await this.storyRepo.findActive({
    maxAgeHours: 72,
    minUpdates: 2,  // Only stories with 2+ updates
  });

  // 2. Rank stories by relevance
  const rankedStories = await this.rankStoriesUseCase.execute({
    stories: activeStories,
    limit: 10,
  });

  // 3. Render with story update renderer
  const content = await this.storyUpdateRenderer.render(
    rankedStories,
    template.config.storyTracking,
  );

  // 4. Save generated content
  const generatedContent = GeneratedContent.create({
    templateId: template.id,
    templateName: template.name,
    templateType: TemplateType.NARRATIVE,
    content,
    metadata: {
      totalItems: rankedStories.length,
      avgUpdatesPerStory: this.computeAvgUpdates(rankedStories),
      categoriesIncluded: this.extractCategories(rankedStories),
    },
    consumed: false,
  });

  await this.generatedContentRepo.save(generatedContent);
}
```

---

### Template 5 (from v1.0): Category Deep Dive ⭐

**Priority**: Phase 2

**Especificaciones**:

- **Frecuencia**: On-demand o semanal por categoría
- **Límite**: Top 10-15 de UNA categoría específica
- **Score mínimo**: 50/100
- **Ventana temporal**: 7 días
- **Incluye**: Trends, top sources, key insights

**Ejemplo: REGULATION Deep Dive**:

```markdown
⚖️ **Regulation Deep Dive** — Past 7 Days

**Key Trends**:

- 🔥 **MiCA compliance**: 3 major updates (Tether exit, exchanges prepare, stablecoin rules)
- 🔥 **US enforcement**: 2 seizures (Capstone $84M, another firm $12M)
- 🔥 **Prediction markets**: New CFTC guidance restricting "mention markets"

**Top Stories** (15):

1. **US SEIZES $84M FROM CAPSTONE** — Montana payments firm allegedly moved hundreds of
   millions for Tether/Bitfinex via Caribbean bank. (Shoal Research · 95 relevance · 2026-09-23)

2. **Tether exits MiCA compliance** — CEO cites 60% bank deposit rule as uninsurable risk.
   (Shoal Research · 92 relevance · 2026-09-22)

[... 13 more stories ...]

**Source Breakdown**:

- Shoal Research Hub: 8 stories (53%)
- Watcher Guru: 4 stories (27%)
- Cointelegraph: 3 stories (20%)

**Related Categories**:

- LEGAL (12 overlap)
- HACK_EXPLOIT (5 overlap, enforcement angle)
```

---

### Template 5: Weekly Recap ⭐

**Priority**: Phase 3

**Especificaciones**:

- **Frecuencia**: Lunes 8:00 AM UTC
- **Límite**: Top 20 de la semana
- **Score mínimo**: 70/100
- **Ventana temporal**: 7 días
- **Estructura**: Multi-category summary + highlights

**Formato**: Similar a Daily Digest pero con:

- Sección "Week in Review" (resumen ejecutivo)
- Top 20 organizadas por categoría
- "Trend Watch" (emerging topics)
- "Coming Up" (eventos próxima semana si detectables)

---

### Template 6: Trending Topics

**Priority**: Phase 3

**Especificaciones**:

- **Frecuencia**: Real-time (actualiza cada hora)
- **Límite**: Top 5 topics (clusters activos)
- **Detección**: Clusters con 3+ mensajes en últimas 6 horas
- **Display**: Topic name + message count + latest update

**Ejemplo**:

```markdown
📈 **Trending Topics** — Updated 14:00 UTC

1. **MiCA Stablecoin Regulation** (8 messages, last 4h)
   Latest: Tether CEO confirms no plans to return to EU markets

2. **US Crypto Enforcement** (5 messages, last 3h)
   Latest: Second payment processor under investigation

3. **Whale Activity: FOMO Leaderboard** (4 messages, last 2h)
   Latest: Bonk Guy maintains #1 position, now up $1.2M

4. **Institutional Crypto Adoption** (3 messages, last 5h)
   Latest: Citi recommends buying pullback

5. **Prediction Markets Regulation** (3 messages, last 6h)
   Latest: CFTC restricts "mention markets"
```

---

## 🎯 Priorización de Implementación

### Phase 1 (MVP) — Semana 1-2

1. ✅ **Hourly Highlights** → Highest value/effort ratio
2. ✅ **Breaking News Alert** → Critical for high-impact events

### Phase 2 — Semana 3-4

3. ✅ **Daily Digest** → Comprehensive daily summary
4. ✅ **Category Deep Dive** → On-demand analysis

### Phase 3 — Semana 5+

5. ⚠️ **Weekly Recap** → Lower priority (can aggregate dailies)
6. ⚠️ **Trending Topics** → Requires real-time UI updates

## 📊 Success Metrics por Template

| Template           | Target Engagement | Success Criteria                          |
| ------------------ | ----------------- | ----------------------------------------- |
| Hourly Highlights  | 60% open rate     | >3 entries per digest, <5% spam reports   |
| Breaking News      | 80% open rate     | >90% accuracy on "urgent" classification  |
| Daily Digest       | 50% open rate     | >8 entries per digest, diverse categories |
| Category Deep Dive | 40% open rate     | On-demand requests >10/month              |
| Weekly Recap       | 55% open rate     | >15 entries, trending topics identified   |
| Trending Topics    | 45% CTR           | Real-time updates <30 sec lag             |

---

**Ver documentos relacionados**:

- [01-overview.md](./01-overview.md) — Visión general
- [02-architecture.md](./02-architecture.md) — Diseño técnico
- [03-infrastructure.md](./03-infrastructure.md) — VPS y deployment
- [05-implementation.md](./05-implementation.md) — Roadmap y testing
