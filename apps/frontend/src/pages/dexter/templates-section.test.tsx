// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { HttpError } from '@/shared/api/http-client';
import { DexterPage } from './index';

vi.mock('@/entities/dexter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/dexter')>();
  return {
    ...actual,
    useDexterTemplates: vi.fn(),
    useDexterTemplate: vi.fn(),
    useCreateTemplate: vi.fn(),
    useUpdateTemplate: vi.fn(),
    useDeleteTemplate: vi.fn(),
    useActivateTemplate: vi.fn(),
    usePreviewTemplate: vi.fn(),
    usePlaceholders: vi.fn(),
    useDisplayMaps: vi.fn(),
    useCreateDisplayMap: vi.fn(),
    useUpdateDisplayMap: vi.fn(),
    useDeleteDisplayMap: vi.fn(),
  };
});

import * as dexter from '@/entities/dexter';

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

const TPL_ACTIVE = {
  id: 'tpl-1',
  command: 'ca',
  name: 'full-dexter-v1',
  bodyMarkdown: '*hola* {{symbol}}',
  isActive: true,
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const TPL_IDLE = {
  id: 'tpl-2',
  command: 'ca',
  name: 'compact-rick-v1',
  bodyMarkdown: 'plano {{name}}',
  isActive: false,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function idleMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    data: undefined,
    ...overrides,
  };
}

function mockAllHappy() {
  vi.mocked(dexter.useDexterTemplates).mockReturnValue({
    data: [TPL_ACTIVE, TPL_IDLE],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof dexter.useDexterTemplates>);
  vi.mocked(dexter.useDexterTemplate).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof dexter.useDexterTemplate>);
  vi.mocked(dexter.useCreateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useCreateTemplate>,
  );
  vi.mocked(dexter.useUpdateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useUpdateTemplate>,
  );
  vi.mocked(dexter.useDeleteTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useDeleteTemplate>,
  );
  vi.mocked(dexter.useActivateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useActivateTemplate>,
  );
  vi.mocked(dexter.usePreviewTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.usePreviewTemplate>,
  );
  vi.mocked(dexter.usePlaceholders).mockReturnValue({
    data: {
      command: 'ca',
      placeholders: [
        { key: 'symbol', type: 'string', nullable: false, example: 'BONK' },
        { key: 'devLine', type: 'string', nullable: true, example: '' },
      ],
    },
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof dexter.usePlaceholders>);
  vi.mocked(dexter.useDisplayMaps).mockReturnValue({
    data: [
      {
        id: 'dm-1',
        placeholderKey: 'chain',
        matchValue: 'solana',
        display: 'SOL',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof dexter.useDisplayMaps>);
  vi.mocked(dexter.useCreateDisplayMap).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useCreateDisplayMap>,
  );
  vi.mocked(dexter.useUpdateDisplayMap).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useUpdateDisplayMap>,
  );
  vi.mocked(dexter.useDeleteDisplayMap).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useDeleteDisplayMap>,
  );
}

describe('DexterPage template management (Lane B)', () => {
  it('mounts the template list with active badge + version', () => {
    mockAllHappy();
    renderPage();
    expect(screen.getByTestId('dexter-templates-list')).toBeInTheDocument();
    expect(screen.getByTestId('dexter-template-row-tpl-1')).toBeInTheDocument();
    expect(screen.getByTestId('dexter-template-row-tpl-2')).toBeInTheDocument();
    expect(
      screen.getByTestId('dexter-template-active-tpl-1'),
    ).toHaveTextContent('active');
    expect(screen.getByTestId('dexter-template-row-tpl-1')).toHaveTextContent(
      'v3',
    );
  });

  it('shows the empty state when the command has no templates', () => {
    mockAllHappy();
    vi.mocked(dexter.useDexterTemplates).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof dexter.useDexterTemplates>);
    renderPage();
    expect(screen.getByTestId('dexter-templates-empty')).toHaveTextContent(
      'No templates',
    );
  });

  it('shows the API-down empty state instead of crashing', () => {
    mockAllHappy();
    vi.mocked(dexter.useDexterTemplates).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof dexter.useDexterTemplates>);
    vi.mocked(dexter.usePlaceholders).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof dexter.usePlaceholders>);
    vi.mocked(dexter.useDisplayMaps).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof dexter.useDisplayMaps>);
    renderPage();
    const empties = screen.getAllByText(
      /unavailable — is the dexter service up\?/,
    );
    expect(empties.length).toBeGreaterThanOrEqual(3);
  });

  it('asks for confirmation before switching the active template', () => {
    mockAllHappy();
    renderPage();
    fireEvent.click(screen.getByTestId('dexter-template-activate-tpl-2'));
    // Another template is active → inline confirm, no mutation fired yet.
    expect(
      screen.getByTestId('dexter-template-activate-confirm-tpl-2'),
    ).toBeInTheDocument();
    expect(
      vi.mocked(dexter.useActivateTemplate).mock.results[0]?.value.mutate,
    ).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByTestId('dexter-template-activate-confirm-tpl-2'),
    );
    expect(
      vi.mocked(dexter.useActivateTemplate).mock.results[0]?.value.mutate,
    ).toHaveBeenCalledWith('tpl-2', expect.anything());
  });

  it('surfaces the 409 active message inline on delete', () => {
    mockAllHappy();
    const body = JSON.stringify({
      message: {
        error:
          'MessageTemplate tpl-1 is active (activate another template of command ca first)',
      },
      statusCode: 409,
    });
    vi.mocked(dexter.useDeleteTemplate).mockReturnValue(
      idleMutation({
        isError: true,
        error: new HttpError(409, body, 'DELETE → 409'),
      }) as unknown as ReturnType<typeof dexter.useDeleteTemplate>,
    );
    renderPage();
    fireEvent.click(screen.getByTestId('dexter-template-delete-tpl-1'));
    fireEvent.click(screen.getByTestId('dexter-template-delete-confirm-tpl-1'));
    expect(
      screen.getByTestId('dexter-template-row-error-tpl-1'),
    ).toHaveTextContent('is active');
  });

  it('surfaces the 409 last message inline on delete', () => {
    mockAllHappy();
    const body = JSON.stringify({
      message: {
        error:
          'MessageTemplate tpl-9 is the last template of command z (create a replacement first)',
      },
      statusCode: 409,
    });
    vi.mocked(dexter.useDeleteTemplate).mockReturnValue(
      idleMutation({
        isError: true,
        error: new HttpError(409, body, 'DELETE → 409'),
      }) as unknown as ReturnType<typeof dexter.useDeleteTemplate>,
    );
    renderPage();
    fireEvent.click(screen.getByTestId('dexter-template-delete-tpl-1'));
    fireEvent.click(screen.getByTestId('dexter-template-delete-confirm-tpl-1'));
    expect(
      screen.getByTestId('dexter-template-row-error-tpl-1'),
    ).toHaveTextContent('last template');
  });

  it('renders the preview result with chips + truncated badge + XSS-as-text', () => {
    mockAllHappy();
    vi.mocked(dexter.usePreviewTemplate).mockReturnValue(
      idleMutation({
        data: {
          text: '<script>alert(1)</script> *BONK* MC {{marketCapUsd}}',
          truncated: true,
          parseMode: 'MarkdownV2',
          placeholdersUsed: ['symbol', 'marketCapUsd'],
          unknown: [],
        },
      }) as unknown as ReturnType<typeof dexter.usePreviewTemplate>,
    );
    renderPage();
    const result = screen.getByTestId('dexter-preview-result');
    expect(result).toHaveTextContent('BONK');
    expect(result).toHaveTextContent('symbol');
    expect(result).toHaveTextContent('truncated');
    // Attack markup renders as text, never as elements.
    expect(result.querySelector('script')).toBeNull();
    expect(result).toHaveTextContent('<script>alert(1)</script>');
    expect(result.querySelector('strong')).toHaveTextContent('BONK');
  });

  it('shows the unresolved preview state with candidates', () => {
    mockAllHappy();
    vi.mocked(dexter.usePreviewTemplate).mockReturnValue(
      idleMutation({
        data: {
          error: 'Ambiguous address: 2 chains',
          address: '0xabc',
          candidates: ['ethereum:0xabc', 'base:0xabc'],
        },
      }) as unknown as ReturnType<typeof dexter.usePreviewTemplate>,
    );
    renderPage();
    expect(screen.getByTestId('dexter-preview-unresolved')).toHaveTextContent(
      'Ambiguous',
    );
    expect(screen.getByTestId('dexter-preview-unresolved')).toHaveTextContent(
      'ethereum:0xabc',
    );
  });

  it('enables timeframe only for c/cc with the valid hint', () => {
    mockAllHappy();
    renderPage();
    const timeframe = screen.getByTestId(
      'dexter-preview-timeframe',
    ) as HTMLInputElement;
    expect(timeframe.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('dexter-preview-command'), {
      target: { value: 'c' },
    });
    expect(
      (screen.getByTestId('dexter-preview-timeframe') as HTMLInputElement)
        .disabled,
    ).toBe(false);
    expect(
      screen.getByText(/Valid: 1m, 5m, 15m, 1h, 4h, 1d, 1w/),
    ).toBeInTheDocument();
  });

  it('renders the placeholders table + display-maps list', () => {
    mockAllHappy();
    renderPage();
    expect(screen.getByTestId('dexter-placeholders-table')).toBeInTheDocument();
    expect(
      screen.getByTestId('dexter-placeholder-row-symbol'),
    ).toHaveTextContent('BONK');
    expect(
      screen.getByTestId('dexter-placeholder-row-devLine'),
    ).toHaveTextContent('—');
    expect(screen.getByTestId('dexter-display-list')).toBeInTheDocument();
    expect(screen.getByTestId('dexter-display-row-dm-1')).toHaveTextContent(
      'solana',
    );
  });

  it('seeds a by-id preview from the template row Preview button', () => {
    mockAllHappy();
    renderPage();
    const row = screen.getByTestId('dexter-template-row-tpl-2');
    const previewButtons = row.querySelectorAll('button');
    fireEvent.click(previewButtons[0]);
    expect(
      (screen.getByTestId('dexter-preview-template-id') as HTMLInputElement)
        .value,
    ).toBe('tpl-2');
  });
});
