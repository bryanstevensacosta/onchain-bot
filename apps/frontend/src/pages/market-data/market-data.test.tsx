// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as marketData from '@/entities/market-data';
import { MarketDataPage } from './index';

const CHAINS = [
  {
    id: 'solana',
    family: 'SOLANA',
    displayName: 'Solana',
    nativeSymbol: 'SOL',
    explorerUrl: 'https://solscan.io',
    geckoTerminalSlug: 'solana',
  },
  {
    id: 'ethereum',
    family: 'EVM',
    displayName: 'Ethereum',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
    geckoTerminalSlug: 'eth',
  },
];

const PROVIDERS = [
  {
    name: 'dexscreener',
    kind: 'market',
    status: 'up',
    latencyMs: 42,
    errorCount: 0,
    lastCheckAt: null,
  },
];

describe('MarketDataPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderPage() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return render(<MarketDataPage />, { wrapper });
  }

  it('renders chains and providers from market-data', () => {
    vi.spyOn(marketData, 'useMarketChains').mockReturnValue({
      data: CHAINS,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof marketData.useMarketChains>);
    vi.spyOn(marketData, 'useMarketProviders').mockReturnValue({
      data: PROVIDERS,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof marketData.useMarketProviders>);
    renderPage();
    expect(screen.getByTestId('market-chains')).toBeInTheDocument();
    expect(screen.getByTestId('chain-solana')).toBeInTheDocument();
    expect(screen.getByTestId('market-providers')).toBeInTheDocument();
    expect(screen.getByTestId('provider-dexscreener')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('renders empty states when the API is down', () => {
    vi.spyOn(marketData, 'useMarketChains').mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof marketData.useMarketChains>);
    vi.spyOn(marketData, 'useMarketProviders').mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof marketData.useMarketProviders>);
    renderPage();
    expect(screen.getByTestId('market-chains-empty')).toBeInTheDocument();
    expect(screen.getByTestId('market-providers-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('market-chains')).not.toBeInTheDocument();
    expect(screen.queryByTestId('market-providers')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
