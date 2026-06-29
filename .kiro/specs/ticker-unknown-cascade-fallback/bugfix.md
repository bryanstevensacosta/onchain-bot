# Bugfix Requirements Document

## Introduction

This bugfix addresses the issue where 39% of VIP call posts (21 out of 54) display "UNKNOWN" instead of the actual token ticker/symbol. The bug occurs when the heuristic parser fails to extract a ticker from the original message, and the system lacks fallback mechanisms to retrieve the ticker from alternative data sources. The fix implements a comprehensive cascading fallback system that attempts to retrieve the ticker from multiple data providers before displaying "UNKNOWN", and adds detailed logging to track ticker resolution attempts.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the HeuristicParserAdapter fails to extract a ticker using regex patterns AND canonical_token_calls.ticker is NULL AND token_snapshots.symbol is NULL THEN the system publishes VIP call posts with ticker = null, resulting in "UNKNOWN" being displayed

1.2 WHEN ticker resolution fails at any step in the TokenApprovedPublishHandler THEN the system does not log the failure reason or which data sources were attempted

1.3 WHEN a token has a valid name in token_snapshots but no ticker/symbol THEN the system does not attempt to derive a ticker from the token name

1.4 WHEN external data providers (DexScreener, GeckoTerminal, CoinGecko, Moralis, Helius) have ticker/symbol information available THEN the system does not query these providers as fallback options

1.5 WHEN VipMessageFormatterAdapter receives ticker = null THEN the system displays "UNKNOWN" without attempting any last-minute resolution

### Expected Behavior (Correct)

2.1 WHEN the HeuristicParserAdapter fails to extract a ticker using regex patterns AND canonical_token_calls.ticker is NULL AND token_snapshots.symbol is NULL THEN the system SHALL attempt to retrieve the ticker from a cascading fallback system of data providers (DexScreener → GeckoTerminal → CoinGecko → Moralis → Helius → name extraction → "ANON") before publishing

2.2 WHEN ticker resolution is attempted at any step THEN the system SHALL log the attempt, data source, success/failure status, and the retrieved ticker value (if any)

2.3 WHEN a token has a valid name in token_snapshots but no ticker/symbol THEN the system SHALL attempt to extract a ticker by taking the first word from the name, converting it to uppercase, and validating it is between 2-10 characters

2.4 WHEN external data providers (DexScreener, GeckoTerminal, CoinGecko, Moralis, Helius) are queried for ticker information THEN the system SHALL use the appropriate API methods (getPairsByToken, getTokenInfo, getTokenContractInfo, token metadata, DAS metadata) to retrieve the symbol

2.5 WHEN all fallback attempts fail to retrieve a ticker THEN the system SHALL use "ANON" (anonymous token) as the final fallback instead of null

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the HeuristicParserAdapter successfully extracts a ticker using regex patterns ($TICKER, Ticker: XYZ, Symbol: XYZ) THEN the system SHALL CONTINUE TO use that extracted ticker without querying fallback providers

3.2 WHEN canonical_token_calls.ticker is populated with a valid ticker value THEN the system SHALL CONTINUE TO use that ticker as the preferred source after heuristic parsing

3.3 WHEN token_snapshots.symbol is populated with a valid symbol value THEN the system SHALL CONTINUE TO use that symbol as a fallback when ticker is not available from canonical_token_calls

3.4 WHEN VipMessageFormatterAdapter receives a valid ticker value THEN the system SHALL CONTINUE TO format it as `$${ticker}` in the published message

3.5 WHEN TokenApprovedPublishHandler processes token approval events THEN the system SHALL CONTINUE TO publish messages to the VIP calls channel with the same event flow and structure

3.6 WHEN existing data provider services (DexScreener, GeckoTerminal, CoinGecko, Moralis, Helius) are used for other purposes in the codebase THEN the system SHALL CONTINUE TO function without disruption or API contract changes
