// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as marketData from '@/entities/market-data';
import { DexterPage } from './index';
import {
  RECENT_SCANS_KEY,
  dedupScanQueries,
  loadRecentScans,
  normalizeScanQuery,
} from './use-recent-scans';

const SOL = 'So11111111111111111111111111111111111111112';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DexterPage />, { wrapper });
}

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

function openModal() {
  fireEvent.click(screen.getByTestId('dexter-open-modal'));
  expect(screen.getByTestId('scan-modal-panel')).toBeInTheDocument();
}

function submitModal(query: string) {
  fireEvent.change(screen.getByTestId('scan-modal-input'), {
    target: { value: query },
  });
  fireEvent.click(screen.getByTestId('scan-modal-submit'));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('scan search modal — open/close', () => {
  it('opens from the scanner search box and shows the recent section', () => {
    renderPage();
    expect(screen.queryByTestId('scan-modal-panel')).not.toBeInTheDocument();
    openModal();
    expect(screen.getByTestId('scan-modal-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('scan-modal-input')).toBeInTheDocument();
    expect(screen.getByTestId('scan-modal-recent')).toBeInTheDocument();
    expect(screen.getByTestId('scan-modal-recent-empty')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    renderPage();
    openModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('scan-modal-panel')).not.toBeInTheDocument();
  });

  it('closes on backdrop click but not on panel click', () => {
    renderPage();
    openModal();
    fireEvent.mouseDown(screen.getByTestId('scan-modal-panel'), {
      target: screen.getByTestId('scan-modal-panel'),
    } as unknown as MouseEvent);
    expect(screen.getByTestId('scan-modal-panel')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('scan-modal-backdrop'), {
      target: screen.getByTestId('scan-modal-backdrop'),
    } as unknown as MouseEvent);
    expect(screen.queryByTestId('scan-modal-panel')).not.toBeInTheDocument();
  });

  it('closes on the close button', () => {
    renderPage();
    openModal();
    fireEvent.click(screen.getByTestId('scan-modal-close'));
    expect(screen.queryByTestId('scan-modal-panel')).not.toBeInTheDocument();
  });
});

describe('scan search modal — recent searches', () => {
  it('persists a successful search and re-runs it on click', () => {
    mockPendingSnapshots();
    renderPage();
    openModal();
    submitModal(`/x solana ${SOL}`);
    expect(screen.getByTestId('scan-modal-results')).toHaveTextContent(
      'Cargando',
    );
    const items = screen.getAllByTestId('scan-modal-recent-item');
    expect(items).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) ?? '[]')).toEqual([
      `/x solana ${SOL}`,
    ]);
    fireEvent.click(screen.getByTestId('scan-modal-close'));
    openModal();
    expect(screen.getAllByTestId('scan-modal-recent-item')).toHaveLength(1);
    fireEvent.click(screen.getAllByTestId('scan-modal-recent-item')[0]);
    expect(screen.getByTestId('scan-modal-results')).toHaveTextContent(
      'Cargando',
    );
    vi.restoreAllMocks();
  });

  it('dedups by normalized query and caps at 10', () => {
    mockPendingSnapshots();
    renderPage();
    openModal();
    submitModal(`/x solana ${SOL}`);
    submitModal(`  /X   SOLANA   ${SOL}  `);
    expect(screen.getAllByTestId('scan-modal-recent-item')).toHaveLength(1);
    for (let i = 0; i < 12; i += 1) {
      submitModal(`/c ethereum 0xaddr${i}`);
    }
    expect(screen.getAllByTestId('scan-modal-recent-item')).toHaveLength(10);
    expect(
      JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) ?? '[]'),
    ).toHaveLength(10);
    vi.restoreAllMocks();
  });

  it('clears all recent searches', () => {
    mockPendingSnapshots();
    renderPage();
    openModal();
    submitModal(`/x solana ${SOL}`);
    expect(screen.getAllByTestId('scan-modal-recent-item')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('scan-modal-clear-recent'));
    expect(
      screen.queryByTestId('scan-modal-recent-item'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('scan-modal-recent-empty')).toBeInTheDocument();
    expect(localStorage.getItem(RECENT_SCANS_KEY)).toBeNull();
    vi.restoreAllMocks();
  });

  it('escapes XSS payloads in recent items (no element injection)', () => {
    mockPendingSnapshots();
    renderPage();
    openModal();
    const payload = '/x solana <img src=x onerror=alert(1)>';
    submitModal(payload);
    // The payload is unparsable as a bare token but the inline assertion
    // matters here: store it directly and re-render to check escaping.
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify([payload]));
    cleanup();
    renderPage();
    openModal();
    const items = screen.getAllByTestId('scan-modal-recent-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('img')).toBeNull();
    expect(items[0].textContent).toContain(
      '/x solana <img src=x onerror=alert(1)>',
    );
    vi.restoreAllMocks();
  });
});

describe('use-recent-scans pure helpers', () => {
  it('normalizes whitespace + case for dedup keys', () => {
    expect(normalizeScanQuery('  /X   SOLANA  abc ')).toBe('/x solana abc');
  });

  it('dedups keeping first display form, max 10', () => {
    const queries = [
      '/x solana A',
      '/X SOLANA a',
      ...Array.from({ length: 12 }, (_, i) => `/c ethereum 0x${i}`),
    ];
    expect(dedupScanQueries(queries)).toHaveLength(10);
    expect(dedupScanQueries(queries)[0]).toBe('/x solana A');
  });

  it('loadRecentScans tolerates garbage', () => {
    localStorage.setItem(RECENT_SCANS_KEY, 'not-json{');
    expect(loadRecentScans()).toEqual([]);
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify({ nope: true }));
    expect(loadRecentScans()).toEqual([]);
  });
});
