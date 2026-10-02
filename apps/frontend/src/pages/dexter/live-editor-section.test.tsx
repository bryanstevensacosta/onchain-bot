// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

vi.mock('@/entities/dexter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/dexter')>();
  return {
    ...actual,
    usePreviewTemplate: vi.fn(),
    previewDexterTemplate: vi.fn(),
  };
});

import * as dexter from '@/entities/dexter';
import { LiveEditorSection } from './live-editor-section';

const previewMock = () =>
  vi.mocked(dexter.previewDexterTemplate) as unknown as ReturnType<
    typeof vi.fn
  >;
const hookMock = () =>
  vi.mocked(dexter.usePreviewTemplate) as unknown as ReturnType<typeof vi.fn>;

const TOKEN = { address: 'So1111', chain: 'solana', symbol: 'BONK' };

const LOAD_OUTPUT = {
  text: '*BONK* | Bonk',
  truncated: true,
  parseMode: 'MarkdownV2',
  placeholdersUsed: ['symbol'],
  unknown: [],
  token: TOKEN,
};

function idleHook(mutateAsync: ReturnType<typeof vi.fn>) {
  return {
    mutate: vi.fn(),
    mutateAsync,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    data: undefined,
  };
}

function renderEditor() {
  return render(<LiveEditorSection />);
}

function loadAddress() {
  fireEvent.change(screen.getByTestId('dexter-live-address'), {
    target: { value: 'So1111' },
  });
  fireEvent.click(screen.getByTestId('dexter-live-load'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('LiveEditorSection', () => {
  it('resolves once via address (no token on the wire) and freezes the snapshot', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    renderEditor();

    loadAddress();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const sent = mutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.address).toBe('So1111');
    expect(sent).not.toHaveProperty('token');

    await act(async () => {});
    expect(screen.getByTestId('dexter-live-result')).toHaveTextContent('BONK');
    expect(screen.getByTestId('dexter-live-placeholders')).toHaveTextContent(
      'symbol',
    );
    expect(screen.getByTestId('dexter-live-truncated')).toHaveTextContent(
      'truncated',
    );
  });

  it('re-renders from the frozen token after a 400ms debounce, without address', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    previewMock().mockResolvedValue({
      text: '*EDITED*',
      truncated: false,
      parseMode: 'MarkdownV2',
      placeholdersUsed: ['symbol'],
      unknown: [],
      token: TOKEN,
    });
    renderEditor();
    loadAddress();
    await act(async () => {});

    fireEvent.change(screen.getByTestId('dexter-live-editor'), {
      target: { value: 'edited {{symbol}}' },
    });
    expect(previewMock()).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(399);
    });
    expect(previewMock()).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {});

    expect(previewMock()).toHaveBeenCalledTimes(1);
    const sent = previewMock().mock.calls[0][0] as Record<string, unknown>;
    expect(sent.token).toEqual(TOKEN);
    expect(sent).not.toHaveProperty('address');
    expect(screen.getByTestId('dexter-live-result')).toHaveTextContent(
      'EDITED',
    );
  });

  it('aborts the in-flight request and discards the stale response', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    let resolveFirst!: (value: unknown) => void;
    const firstGate = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    previewMock()
      .mockImplementationOnce(() => firstGate)
      .mockImplementationOnce(() =>
        Promise.resolve({
          text: '*SECOND*',
          truncated: false,
          parseMode: 'MarkdownV2',
          placeholdersUsed: [],
          unknown: [],
        }),
      );
    renderEditor();
    loadAddress();
    await act(async () => {});

    fireEvent.change(screen.getByTestId('dexter-live-editor'), {
      target: { value: 'first' },
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(previewMock()).toHaveBeenCalledTimes(1);
    const firstSignal = previewMock().mock.calls[0][1] as AbortSignal;

    fireEvent.change(screen.getByTestId('dexter-live-editor'), {
      target: { value: 'second' },
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});

    expect(firstSignal.aborted).toBe(true);
    expect(previewMock()).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('dexter-live-result')).toHaveTextContent(
      'SECOND',
    );

    await act(async () => {
      resolveFirst({
        text: '*FIRST*',
        truncated: false,
        parseMode: 'MarkdownV2',
        placeholdersUsed: [],
        unknown: [],
      });
    });
    await act(async () => {});
    expect(screen.getByTestId('dexter-live-result')).toHaveTextContent(
      'SECOND',
    );
    expect(screen.getByTestId('dexter-live-result')).not.toHaveTextContent(
      'FIRST',
    );
  });

  it('invalidates the snapshot when address or command changes', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    renderEditor();
    loadAddress();
    await act(async () => {});

    fireEvent.change(screen.getByTestId('dexter-live-address'), {
      target: { value: 'So2222' },
    });
    expect(screen.getByTestId('dexter-live-stale')).toBeTruthy();

    fireEvent.change(screen.getByTestId('dexter-live-editor'), {
      target: { value: 'typed while stale' },
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {});
    expect(previewMock()).not.toHaveBeenCalled();
  });

  it('shows the unresolved state when the address does not resolve', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      error: 'Token not found',
      address: 'So9999',
    });
    hookMock().mockReturnValue(idleHook(mutateAsync));
    renderEditor();

    fireEvent.change(screen.getByTestId('dexter-live-address'), {
      target: { value: 'So9999' },
    });
    fireEvent.click(screen.getByTestId('dexter-live-load'));
    await act(async () => {});

    expect(screen.getByTestId('dexter-live-unresolved')).toHaveTextContent(
      'Token not found',
    );

    fireEvent.change(screen.getByTestId('dexter-live-editor'), {
      target: { value: 'typed with no snapshot' },
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {});
    expect(previewMock()).not.toHaveBeenCalled();
  });
});
