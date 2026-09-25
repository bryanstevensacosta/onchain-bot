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
});
