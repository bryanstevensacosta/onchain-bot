// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it } from 'vitest';

import {
  addressKindTone,
  chartUrlFor,
  detectChainForAddress,
  isKnownAddressKind,
  normalizeAddressKind,
  providerHealthTone,
} from './helpers';

describe('market-data helpers', () => {
  it('normalises known kinds and falls back to unknown', () => {
    expect(normalizeAddressKind('token')).toBe('token');
    expect(normalizeAddressKind('wallet')).toBe('wallet');
    expect(normalizeAddressKind('program')).toBe('program');
    expect(normalizeAddressKind('exchange')).toBe('exchange');
    expect(normalizeAddressKind('garbage')).toBe('unknown');
    expect(normalizeAddressKind(undefined)).toBe('unknown');
  });

  it('detects known kinds only', () => {
    expect(isKnownAddressKind('token')).toBe(true);
    expect(isKnownAddressKind('unknown')).toBe(false);
    expect(isKnownAddressKind('nope')).toBe(false);
  });

  it('maps kind to a badge tone with unknown fallback', () => {
    expect(addressKindTone('token')).toBe('blue');
    expect(addressKindTone('wallet')).toBe('green');
    expect(addressKindTone('program')).toBe('cyan');
    expect(addressKindTone('exchange')).toBe('yellow');
    expect(addressKindTone('unknown')).toBe('gray');
  });

  it('maps provider health to a badge tone', () => {
    expect(providerHealthTone('up')).toBe('green');
    expect(providerHealthTone('degraded')).toBe('yellow');
    expect(providerHealthTone('down')).toBe('red');
    expect(providerHealthTone('unknown')).toBe('gray');
  });
  it('builds chart urls per chain family', () => {
    const sol = chartUrlFor(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    expect(sol.dexscreener).toContain('dexscreener.com/solana/');
    expect(sol.geckoterminal).toContain('geckoterminal.com/solana/');
    const evm = chartUrlFor('ethereum', '0xabc');
    expect(evm.dexscreener).toContain('dexscreener.com/ethereum/0xabc');
    expect(evm.geckoterminal).toContain('geckoterminal.com/eth/pools/0xabc');
  });
});

describe('detectChainForAddress (bare-address format guess)', () => {
  it('maps base58 32-44 chars to solana with no alternatives', () => {
    const hit = detectChainForAddress(
      'So11111111111111111111111111111111111111112',
    );
    expect(hit?.chain).toBe('solana');
    expect(hit?.candidates).toEqual(['solana']);
  });

  it('maps 0x + 40 hex to ethereum and lists every EVM alternative', () => {
    const hit = detectChainForAddress(
      '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    );
    expect(hit?.chain).toBe('ethereum');
    expect(hit?.candidates).toContain('ethereum');
    expect(hit?.candidates).toContain('base');
    expect(hit?.candidates).toContain('bsc');
    expect(hit && hit.candidates.length).toBeGreaterThan(1);
  });

  it('returns null for garbage, empty, and slash input', () => {
    expect(detectChainForAddress('hello')).toBeNull();
    expect(detectChainForAddress('0x123')).toBeNull();
    expect(detectChainForAddress('')).toBeNull();
    expect(detectChainForAddress('/x solana abc')).toBeNull();
  });
});
