# Bugfix Requirements Document

## Introduction

This document describes fixes for two critical bugs in the call tracking system that prevent published calls from being tracked correctly:

1. **mcAtPublish validation failure**: Tracked published calls fail validation when the market cap at call time is unavailable, causing tracking to fail silently
2. **Invalid Solana address normalization**: Solana addresses are incorrectly lowercased during normalization, causing validation errors when reconstructing from the database

These bugs prevent the system from tracking published calls on both Ethereum and Solana chains, impacting the filtering and gating logic that depends on tracking data.

## Bug Analysis

### Current Behavior (Defect)

#### Bug 1: mcAtPublish Validation Failure

1.1 WHEN a call is published and `PublishedCallRepository.findByChainAndAddress()` returns `null` THEN the system fails to track the call with the error "mcAtPublish must be a non-negative finite number"

1.2 WHEN `published?.mcAtCall` is `null` and the `published` object exists THEN the system correctly defaults `mcAtPublish` to `0`

1.3 WHEN `published` is `null` THEN the expression `published?.mcAtCall ?? 0` evaluates to `undefined` instead of `0`, causing validation to fail

#### Bug 2: Invalid Solana Address Normalization

1.4 WHEN a Solana address is normalized using `NormalizedAddress.fromSolana()` THEN the system lowercases the address using `.toLowerCase()`

1.5 WHEN a lowercased Solana address is validated through Base58 decoding THEN the validation passes on the initial save

1.6 WHEN the system attempts to reconstruct a NormalizedAddress from a lowercased Solana address stored in the database THEN the Base58 validation fails with "Invalid Solana address: {lowercased_address}"

1.7 WHEN `reconstructLooseAddress()` attempts to recover from an invalid stored address THEN it fails because the stored value is already corrupted by lowercasing

### Expected Behavior (Correct)

#### Bug 1: mcAtPublish Validation Failure

2.1 WHEN a call is published and `PublishedCallRepository.findByChainAndAddress()` returns `null` THEN the system SHALL default `mcAtPublish` to `0` and successfully create the tracked call

2.2 WHEN `published?.mcAtCall` is `null` THEN the system SHALL use `0` as the `mcAtPublish` value

2.3 WHEN determining the `mcAtPublish` value THEN the system SHALL ensure the fallback chain `(published?.mcAtCall) ?? 0` evaluates to a valid number in all cases

#### Bug 2: Invalid Solana Address Normalization

2.4 WHEN a Solana address is normalized using `NormalizedAddress.fromSolana()` THEN the system SHALL preserve the original case-sensitive Base58 string

2.5 WHEN a Solana address is validated THEN the system SHALL verify it decodes to exactly 32 bytes without modifying its case

2.6 WHEN the system reconstructs a NormalizedAddress from a Solana address stored in the database THEN the validation SHALL succeed because the address was stored in its original case-sensitive form

2.7 WHEN comparing Solana addresses for equality THEN the system SHALL perform case-sensitive comparison to maintain structural correctness

### Unchanged Behavior (Regression Prevention)

#### Bug 1: mcAtPublish Validation Failure

3.1 WHEN a call is published and `PublishedCallRepository.findByChainAndAddress()` returns a valid published call with `mcAtCall` set THEN the system SHALL CONTINUE TO use that value as `mcAtPublish`

3.2 WHEN creating a tracked call with a valid `mcAtPublish` value THEN the system SHALL CONTINUE TO validate that the value is non-negative and finite

3.3 WHEN logging tracking results THEN the system SHALL CONTINUE TO log the tracked call ID and `mcAtPublish` value

#### Bug 2: Invalid Solana Address Normalization

3.4 WHEN an EVM address is normalized using `NormalizedAddress.fromEvm()` THEN the system SHALL CONTINUE TO lowercase the address for case-insensitive comparison

3.5 WHEN validating an EVM address THEN the system SHALL CONTINUE TO use the regex pattern `^0x[a-fA-F0-9]{40}$` with case-insensitive matching

3.6 WHEN comparing EVM addresses for equality THEN the system SHALL CONTINUE TO perform case-insensitive comparison through lowercasing

3.7 WHEN reconstructing addresses from the database for EVM chains THEN the system SHALL CONTINUE TO use `NormalizedAddress.fromEvm()` successfully

3.8 WHEN creating a `TokenLocator` with a valid `NormalizedAddress` THEN the system SHALL CONTINUE TO create the locator successfully

3.9 WHEN handling address normalization errors THEN the system SHALL CONTINUE TO throw `DomainError` with `ErrorCode.INVALID_ADDRESS`
