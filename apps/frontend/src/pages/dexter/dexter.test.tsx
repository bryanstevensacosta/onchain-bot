// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as marketData from '@/entities/market-data';
import { DexterPage } from './index';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DexterPage />, { wrapper });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockPendingSnapshots() {
  vi.spyOn(marketData, 'useAddressSnapshot').mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
  } as unknown as ReturnType<typeof marketData.useAddressSnapshot>);
  vi.spyOn(marketData, 'useCompatSnapshot').mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
  } as unknown as ReturnType<typeof marketData.useCompatSnapshot>);
}

describe('DexterPage', () => {
  it('renders the idle state without touching the API', () => {
    renderPage();
    expect(screen.getByTestId('dexter-idle')).toBeInTheDocument();
    expect(screen.queryByTestId('dexter-x')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dexter-c')).not.toBeInTheDocument();
  });

  it('rejects unparsable input with usage guidance', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: { value: '/x only-one-part' },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-parse-error')).toBeInTheDocument();
    expect(screen.queryByTestId('dexter-x')).not.toBeInTheDocument();
  });

  it('accepts /x <chain> <address> and mounts the full-scan card', () => {
    mockPendingSnapshots();
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: {
        value: '/x solana So11111111111111111111111111111111111111112',
      },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-x')).toBeInTheDocument();
    expect(screen.queryByTestId('dexter-parse-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('dexter-scan-loading')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('accepts /c <chain> <address> and mounts the chart card', () => {
    mockPendingSnapshots();
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: { value: '/c ethereum 0xabc' },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-c')).toBeInTheDocument();
    expect(screen.getByTestId('dexter-chart-loading')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('accepts a bare Solana address and auto-fills solana', () => {
    mockPendingSnapshots();
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: {
        value: 'So11111111111111111111111111111111111111112',
      },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-x')).toBeInTheDocument();
    expect(screen.queryByTestId('dexter-parse-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('dexter-detected-chain')).toHaveTextContent(
      'solana',
    );
    vi.restoreAllMocks();
  });

  it('accepts /x <bare solana> without a chain qualifier', () => {
    mockPendingSnapshots();
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: {
        value: '/x So11111111111111111111111111111111111111112',
      },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-x')).toBeInTheDocument();
    expect(screen.getByTestId('dexter-detected-chain')).toHaveTextContent(
      'solana',
    );
    vi.restoreAllMocks();
  });

  it('accepts a bare EVM address, defaults to ethereum, and names the explicit choice', () => {
    mockPendingSnapshots();
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: {
        value: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-x')).toBeInTheDocument();
    expect(screen.getByTestId('dexter-detected-chain')).toHaveTextContent(
      'ethereum',
    );
    // Adversarial: 0x is valid on every EVM chain — the UI must say so,
    // never silently pretend ethereum is the only option.
    expect(screen.getByTestId('dexter-ambiguous-hint')).toHaveTextContent(
      'base',
    );
    vi.restoreAllMocks();
  });

  it('rejects a garbage single token with usage guidance', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    expect(screen.getByTestId('dexter-parse-error')).toBeInTheDocument();
    expect(screen.queryByTestId('dexter-x')).not.toBeInTheDocument();
  });

  it('renders FDV + supply cards with real values', () => {
    vi.spyOn(marketData, 'useAddressSnapshot').mockReturnValue({
      data: {
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        kind: 'token',
        key: 'solana:so11111111111111111111111111111111111111112',
        status: 'ready',
        providers: ['geckoterminal'],
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof marketData.useAddressSnapshot>);
    vi.spyOn(marketData, 'useCompatSnapshot').mockReturnValue({
      data: {
        priceUsd: 1.5,
        liquidityUsd: 50,
        volume24hUsd: 10,
        marketCapUsd: 100,
        fdvUsd: 200,
        priceChange24h: 2,
        holders: 42,
        top10HolderPercent: 5,
        symbol: 'TKN',
        name: 'Token',
        lockedLiquidityPercent: null,
        burnedPercent: null,
        totalSupply: 1000000,
        circulatingSupply: 800000,
        maxSupply: 1000000,
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        kind: 'token',
        key: 'solana:so11111111111111111111111111111111111111112',
        status: 'ready',
        providers: ['geckoterminal'],
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof marketData.useCompatSnapshot>);
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: {
        value: '/x solana So11111111111111111111111111111111111111112',
      },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    const result = screen.getByTestId('dexter-scan-result');
    expect(result).toHaveTextContent('FDV');
    expect(result).toHaveTextContent('200');
    expect(result).toHaveTextContent('Total supply');
    expect(result).toHaveTextContent('1000000');
    expect(result).toHaveTextContent('Circulating');
    expect(result).toHaveTextContent('800000');
    expect(result).toHaveTextContent('Max supply');
    vi.restoreAllMocks();
  });

  it('renders supply cards null-safe (em-dash, no crash)', () => {
    vi.spyOn(marketData, 'useAddressSnapshot').mockReturnValue({
      data: {
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        kind: 'token',
        key: 'solana:so11111111111111111111111111111111111111112',
        status: 'ready',
        providers: ['dexscreener'],
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof marketData.useAddressSnapshot>);
    vi.spyOn(marketData, 'useCompatSnapshot').mockReturnValue({
      data: {
        priceUsd: 1.5,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders: null,
        top10HolderPercent: null,
        symbol: 'TKN',
        name: 'Token',
        lockedLiquidityPercent: null,
        burnedPercent: null,
        totalSupply: null,
        circulatingSupply: null,
        maxSupply: null,
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        kind: 'token',
        key: 'solana:so11111111111111111111111111111111111111112',
        status: 'ready',
        providers: ['dexscreener'],
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof marketData.useCompatSnapshot>);
    renderPage();
    fireEvent.change(screen.getByTestId('dexter-input'), {
      target: {
        value: '/x solana So11111111111111111111111111111111111111112',
      },
    });
    fireEvent.click(screen.getByTestId('dexter-submit'));
    const result = screen.getByTestId('dexter-scan-result');
    expect(result).toHaveTextContent('Total supply');
    expect(result).toHaveTextContent('Circulating');
    expect(result).toHaveTextContent('Max supply');
    expect(result).toHaveTextContent('—');
    vi.restoreAllMocks();
  });
});
