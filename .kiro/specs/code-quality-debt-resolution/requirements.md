# Code Quality Debt Resolution - Requirements

## Introduction

This document defines requirements to resolve pre-existing code quality issues (lint errors and failing tests) in the onchain-bot project. The scope includes 8 ESLint errors and 11 failing test suites that existed before the ticker-unknown-cascade-fallback fix.

## Glossary

- **Lint Error**: ESLint rule violation that prevents code from passing quality checks
- **Unsafe Type**: TypeScript `any` type usage that bypasses type safety
- **Test Failure**: Jest test case that does not pass when executed
- **Mock Helper**: Test utility function that creates test doubles for dependencies

## Current State (Defects)

### 1. ESLint Errors

#### 1.1 Helius Service Unsafe Return

**File**: `apps/backend/src/data-provider/helius/helius.service.ts:162`

**Error**: `Unsafe return of a value of type 'any'`

WHEN the `parseTransaction` method catches an error THEN it does not explicitly return null in the catch block, causing TypeScript to infer an unsafe return type

#### 1.2 KOL Reputation Scheduler Test - Unsafe `this` Binding

**File**: `apps/backend/src/kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.spec.ts`

**Errors**: 
- Line 28: `Unsafe return of a value of type 'any'. 'this' is typed as 'any'`
- Line 46: `Unsafe call of an 'any' typed value. 'this' is typed as 'any'`

WHEN test helper functions (`makeKolRepo`, `makeRecompute`) use object literals with methods THEN TypeScript cannot infer the correct `this` type, resulting in unsafe `any` typing

#### 1.3 Call Tracking Test Helpers - Missing `this: void`

**Files**: 
- `apps/backend/src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.spec.ts` (lines 20, 26, 53)
- `apps/backend/src/token/call-tracking/infrastructure/event-bus/call-published-tracked.handler.spec.ts` (lines 17, 39)

**Error**: `A method that is not declared with 'this: void' may cause unintentional scoping of 'this' when separated from its object`

WHEN mock factory functions create objects with methods that don't declare `this` type THEN ESLint warns about potential `this` binding issues

### 2. Failing Tests

#### 2.1 Chain Detection Tests

**Files**:
- `src/chain/detection/infrastructure/probers/evm-chain-prober.adapter.spec.ts`
- `src/chain/detection/infrastructure/probers/solana-chain-prober.adapter.spec.ts`

WHEN chain detection tests run THEN they fail due to missing API keys or incorrect mock configurations

#### 2.2 Chain Explorer Provider Tests

**Files**:
- `src/chain/explorer/infrastructure/providers/birdeye.adapter.spec.ts`
- `src/chain/explorer/infrastructure/providers/coingecko.adapter.spec.ts`
- `src/chain/explorer/infrastructure/providers/helius-das.adapter.spec.ts`
- `src/chain/explorer/infrastructure/providers/helius.adapter.spec.ts`
- `src/chain/explorer/infrastructure/providers/mobula.adapter.spec.ts`
- `src/chain/explorer/infrastructure/providers/moralis.adapter.spec.ts`
- `src/chain/explorer/infrastructure/providers/solana-rpc.adapter.spec.ts`

WHEN external provider adapter tests run THEN they fail due to API configuration issues, timeout problems, or incorrect mock setups

#### 2.3 Token Image Service Test

**File**: `src/chain/explorer/application/services/token-image.service.spec.ts`

WHEN token image service tests run THEN they fail due to cache adapter issues or image processing errors

#### 2.4 Cache Adapter Tests

**File**: `src/shared/cache/token-image-cache.adapter.spec.ts`

WHEN LRU cache adapter tests run THEN they fail with `TypeError: lru_cache_1.LRUCache is not a constructor`

## Expected Behavior (Correct)

### 3. ESLint Error Resolution

#### 3.1 Type-Safe Return Values

WHEN any function has an error path THEN it SHALL explicitly return a value with a type annotation to avoid `any` inference

#### 3.2 Proper `this` Typing in Test Helpers

WHEN test helper functions create mock objects with methods THEN they SHALL either:
- Declare `this: void` for stateless methods
- Use proper TypeScript class syntax for stateful objects
- Use arrow functions to avoid `this` binding issues

#### 3.3 Explicit `this: void` Declarations

WHEN a method does not use `this` context THEN it SHALL declare `this: void` as the first parameter

### 4. Test Reliability

#### 4.1 Isolated Test Environment

WHEN any test runs THEN it SHALL NOT depend on external API keys, network access, or shared state

#### 4.2 Proper Mock Configuration

WHEN external dependencies are mocked THEN the mocks SHALL match the actual service interface and behavior

#### 4.3 Constructor Compatibility

WHEN a test imports an external library (like lru-cache) THEN it SHALL use the correct import syntax for the library version

#### 4.4 Deterministic Test Execution

WHEN tests run THEN they SHALL produce consistent results regardless of execution order or environment

## Success Criteria

### 5.1 Zero ESLint Errors

WHEN `npm run lint` executes in apps/backend THEN it SHALL complete with 0 errors (warnings are acceptable)

### 5.2 All Tests Pass

WHEN `npm test` executes in apps/backend THEN it SHALL complete with 0 failing test suites

### 5.3 No New Technical Debt

WHEN fixes are applied THEN they SHALL NOT introduce new `eslint-disable` comments or suppress warnings

### 5.4 Maintainable Code

WHEN code is reviewed THEN it SHALL follow TypeScript best practices and be easily understood by future maintainers
