# Bugfix Requirements Document

## Introduction

The VIP calls publication system currently sends duplicate messages to the Telegram channel "GansterDegenCallz" when the same token receives multiple `TokenFilteredEvent` emissions. Evidence from the database shows duplicate message pairs (1075/1076 for Solana token `3i6jxygrsaedj3be2vjxcrqqxhqxq1bpraxbxjprpump` and 1077/1078 for Ethereum token `0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b`), where only one message per pair was persisted to the `published_calls` table. This bugfix ensures each unique token (identified by chain + address) is published exactly once, preventing duplicate publications while preserving all other publication behaviors.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a `TokenFilteredEvent` is emitted for a token that has already been published (same chain + address combination) THEN the system publishes a duplicate message to the Telegram channel without checking prior publication status

1.2 WHEN the `TokenApprovedPublishHandler` receives a `TokenFilteredEvent` THEN the system does not verify if the token was previously published before calling `VipCallsPublishUseCase.execute()`

1.3 WHEN multiple `TokenFilteredEvent` instances are emitted for the same token THEN the system processes each event independently, resulting in multiple Telegram messages for the same token

### Expected Behavior (Correct)

2.1 WHEN a `TokenFilteredEvent` is emitted for a token that has already been published (same chain + address combination) THEN the system SHALL check the `published_calls` table using `PublishedCallRepository.findByChainAndAddress()` and skip publication if a record exists

2.2 WHEN the `TokenApprovedPublishHandler` receives a `TokenFilteredEvent` THEN the system SHALL verify publication status before calling `VipCallsPublishUseCase.execute()` and only proceed if the token has not been published

2.3 WHEN multiple `TokenFilteredEvent` instances are emitted for the same token THEN the system SHALL ensure only the first event results in a Telegram publication, with subsequent events being skipped

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a `TokenFilteredEvent` is emitted for a token that has never been published THEN the system SHALL CONTINUE TO publish the token to the Telegram channel and persist to the database as it currently does

3.2 WHEN a token is successfully published THEN the system SHALL CONTINUE TO emit `RegisterCallForMilestonesEvent` for milestone tracking if the token has a valid market cap

3.3 WHEN token publication succeeds THEN the system SHALL CONTINUE TO store the `PublishedCall` record in the database with status "PUBLISHED"

3.4 WHEN token publication fails THEN the system SHALL CONTINUE TO store the `PublishedCall` record in the database with status "FAILED"

3.5 WHEN retrieving token metadata from `CanonicalTokenCallRepository` and `TokenSnapshotRepository` THEN the system SHALL CONTINUE TO use the same logic for assembling ticker, name, market cap, liquidity, holder count, and chart URL

3.6 WHEN formatting the publication message THEN the system SHALL CONTINUE TO use `MessageFormatterPort.format()` with the same `ApprovedCallInput` structure

3.7 WHEN handling errors during publication THEN the system SHALL CONTINUE TO log warnings without crashing the event handler
