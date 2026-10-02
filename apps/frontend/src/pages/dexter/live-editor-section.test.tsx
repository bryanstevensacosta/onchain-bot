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
    useDexterTemplates: vi.fn(),
    useCreateTemplate: vi.fn(),
    useUpdateTemplate: vi.fn(),
    usePreviewTemplate: vi.fn(),
    previewDexterTemplate: vi.fn(),
  };
});

import { HttpError } from '@/shared/api/http-client';
import * as dexter from '@/entities/dexter';
import { LiveEditorSection } from './live-editor-section';

const previewMock = () =>
  vi.mocked(dexter.previewDexterTemplate) as unknown as ReturnType<
    typeof vi.fn
  >;
const hookMock = () =>
  vi.mocked(dexter.usePreviewTemplate) as unknown as ReturnType<typeof vi.fn>;

const TOKEN = { address: 'So1111', chain: 'solana', symbol: 'BONK' };

const TPL_CA = {
  id: 'tpl-ca-1',
  command: 'ca',
  name: 'full-dexter-v1',
  bodyMarkdown: '*{{symbol}}* | {{name}}',
  isActive: true,
  version: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

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

function idleMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    data: undefined,
    ...overrides,
  };
}

function mockSaveHappy() {
  vi.mocked(dexter.useDexterTemplates).mockReturnValue({
    data: [TPL_CA],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof dexter.useDexterTemplates>);
  vi.mocked(dexter.useCreateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useCreateTemplate>,
  );
  vi.mocked(dexter.useUpdateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useUpdateTemplate>,
  );
}

function pickTemplate() {
  fireEvent.change(screen.getByTestId('dexter-live-template-picker'), {
    target: { value: 'tpl-ca-1' },
  });
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
  mockSaveHappy();
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

  it('saves a free draft as a new template and links the result', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    const created = { ...TPL_CA, id: 'tpl-ca-9', name: 'live-saved-v1' };
    const createMutate = vi.fn(
      (
        _body: unknown,
        opts?: { onSuccess?: (view: typeof created) => void },
      ) => {
        opts?.onSuccess?.(created);
      },
    );
    vi.mocked(dexter.useCreateTemplate).mockReturnValue(
      idleMutation({
        mutate: createMutate,
      }) as unknown as ReturnType<typeof dexter.useCreateTemplate>,
    );
    renderEditor();

    expect(screen.queryByTestId('dexter-live-editing')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('dexter-live-save-name'), {
      target: { value: 'live-saved-v1' },
    });
    fireEvent.click(screen.getByTestId('dexter-live-save'));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toEqual({
      command: 'ca',
      name: 'live-saved-v1',
      bodyMarkdown: expect.any(String),
    });
    expect(
      vi.mocked(dexter.useUpdateTemplate).mock.results[0]?.value.mutate,
    ).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('picks a template into the draft and saves the body back', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    renderEditor();

    pickTemplate();
    expect(screen.getByTestId('dexter-live-editing')).toHaveTextContent(
      'Editing full-dexter-v1 (v2)',
    );
    expect(
      (screen.getByTestId('dexter-live-editor') as HTMLTextAreaElement).value,
    ).toBe('*{{symbol}}* | {{name}}');
    expect(
      (screen.getByTestId('dexter-live-save-name') as HTMLInputElement).value,
    ).toBe('full-dexter-v1');

    fireEvent.change(screen.getByTestId('dexter-live-editor'), {
      target: { value: 'edited body {{symbol}}' },
    });
    fireEvent.click(screen.getByTestId('dexter-live-save'));

    const updateMutate = vi.mocked(dexter.useUpdateTemplate).mock.results[0]
      ?.value.mutate as ReturnType<typeof vi.fn>;
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: 'tpl-ca-1',
      body: { bodyMarkdown: 'edited body {{symbol}}' },
    });
    expect(
      vi.mocked(dexter.useCreateTemplate).mock.results[0]?.value.mutate,
    ).not.toHaveBeenCalled();
  });

  it('detaches back to a free draft — the next save creates', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    renderEditor();

    pickTemplate();
    expect(screen.getByTestId('dexter-live-editing')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dexter-live-detach'));
    expect(screen.queryByTestId('dexter-live-editing')).not.toBeInTheDocument();
    expect(
      (screen.getByTestId('dexter-live-template-picker') as HTMLSelectElement)
        .value,
    ).toBe('');

    fireEvent.change(screen.getByTestId('dexter-live-save-name'), {
      target: { value: 'detached-new-v1' },
    });
    fireEvent.click(screen.getByTestId('dexter-live-save'));
    expect(
      vi.mocked(dexter.useCreateTemplate).mock.results[0]?.value.mutate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'detached-new-v1' }),
      expect.anything(),
    );
    expect(
      vi.mocked(dexter.useUpdateTemplate).mock.results[0]?.value.mutate,
    ).not.toHaveBeenCalled();
  });

  it('renaming a linked template saves as new instead of patching', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    renderEditor();

    pickTemplate();
    fireEvent.change(screen.getByTestId('dexter-live-save-name'), {
      target: { value: 'renamed-copy-v1' },
    });
    fireEvent.click(screen.getByTestId('dexter-live-save'));
    expect(
      vi.mocked(dexter.useCreateTemplate).mock.results[0]?.value.mutate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'renamed-copy-v1' }),
      expect.anything(),
    );
    expect(
      vi.mocked(dexter.useUpdateTemplate).mock.results[0]?.value.mutate,
    ).not.toHaveBeenCalled();
  });

  it('surfaces the 409 duplicate message on save-as-new', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(LOAD_OUTPUT);
    hookMock().mockReturnValue(idleHook(mutateAsync));
    const body = JSON.stringify({
      message: {
        error: 'A template with name dup-v1 already exists for command ca',
      },
      statusCode: 409,
    });
    vi.mocked(dexter.useCreateTemplate).mockReturnValue(
      idleMutation({
        isError: true,
        error: new HttpError(409, body, 'POST → 409'),
      }) as unknown as ReturnType<typeof dexter.useCreateTemplate>,
    );
    renderEditor();

    expect(screen.getByTestId('dexter-live-save-error')).toHaveTextContent(
      'already exists',
    );
  });
});
