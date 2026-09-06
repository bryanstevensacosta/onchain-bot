// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/entities/crypto-news/model/use-crypto-news', () => ({
  useCryptoNewsMessages: vi.fn(),
  useCryptoNewsSources: vi.fn(),
}));

vi.mock('@/features/crypto-news-publisher/model/use-keywords', () => {
  const mutStub = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  };
  return {
    useKeywords: vi.fn(),
    useCreateKeyword: vi.fn(() => ({ ...mutStub })),
    useCreateKeywordBatch: vi.fn(() => ({ ...mutStub })),
    useUpdateKeyword: vi.fn(() => ({ ...mutStub })),
    useDeleteKeyword: vi.fn(() => ({ ...mutStub })),
  };
});

vi.mock('@/features/crypto-news-publisher/model/use-queue', () => ({
  useQueue: vi.fn(),
  useQueueCounts: vi.fn(),
}));

vi.mock('@/features/crypto-news-publisher/model/use-llm-config', () => {
  const mutStub = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  };
  return {
    useLlmConfig: vi.fn(),
    useLlmModels: vi.fn(),
    useTemplates: vi.fn(),
    useCreateTemplate: vi.fn(),
    useUpdateTemplate: vi.fn(),
    useDeleteTemplate: vi.fn(),
    useUpdateLlmConfig: vi.fn(),
    useToggleMatching: vi.fn(() => ({ ...mutStub })),
    useToggleLlm: vi.fn(() => ({ ...mutStub })),
    useTogglePublishing: vi.fn(() => ({ ...mutStub })),
  };
});

import {
  useCryptoNewsMessages,
  useCryptoNewsSources,
} from '@/entities/crypto-news/model/use-crypto-news';
import {
  useKeywords,
  useCreateKeyword,
  useUpdateKeyword,
  useDeleteKeyword,
} from '@/features/crypto-news-publisher/model/use-keywords';
import {
  useQueue,
  useQueueCounts,
} from '@/features/crypto-news-publisher/model/use-queue';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useLlmConfig,
  useLlmModels,
  useTemplates,
  useToggleMatching,
  useUpdateLlmConfig,
  useUpdateTemplate,
} from '@/features/crypto-news-publisher/model/use-llm-config';
import { CryptoNewsPage } from '@/pages/crypto-news';
import type {
  CryptoNewsMessage,
  CryptoNewsSource,
} from '@/entities/crypto-news/api/crypto-news-queries';
import type { KeywordView } from '@/features/crypto-news-publisher/api/keywords-api';
import type {
  QueueCountsView,
  QueueEntryView,
} from '@/features/crypto-news-publisher/api/queue-api';
import type {
  LlmConfig,
  LlmModel,
  PromptTemplate,
} from '@/features/crypto-news-publisher/api/llm-config-api';
import { LlmConfigForm } from '@/features/crypto-news-publisher/ui/llm-config';
import { PromptTemplates } from '@/features/crypto-news-publisher/ui/prompt-templates';

const mockedUseMessages = vi.mocked(useCryptoNewsMessages);
const mockedUseSources = vi.mocked(useCryptoNewsSources);
const mockedUseKeywords = vi.mocked(useKeywords);
const mockedUseQueue = vi.mocked(useQueue);
const mockedUseQueueCounts = vi.mocked(useQueueCounts);
const mockedUseCreateKeyword = vi.mocked(useCreateKeyword);
const mockedUseUpdateKeyword = vi.mocked(useUpdateKeyword);
const mockedUseDeleteKeyword = vi.mocked(useDeleteKeyword);
const mockedUseLlmConfig = vi.mocked(useLlmConfig);
const mockedUseLlmModels = vi.mocked(useLlmModels);
const mockedUseTemplates = vi.mocked(useTemplates);
const mockedUseUpdateLlmConfig = vi.mocked(useUpdateLlmConfig);
const mockedUseCreateTemplate = vi.mocked(useCreateTemplate);
const mockedUseUpdateTemplate = vi.mocked(useUpdateTemplate);
const mockedUseDeleteTemplate = vi.mocked(useDeleteTemplate);

function makeEmptyKeywordsQuery() {
  return {
    data: [] as ReadonlyArray<KeywordView>,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useKeywords>;
}

function makeKeywordsQuery(data: ReadonlyArray<KeywordView>) {
  return {
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useKeywords>;
}

function makeEmptyQueueQuery() {
  return {
    data: [] as ReadonlyArray<QueueEntryView>,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useQueue>;
}

function makeZeroCountsQuery() {
  return {
    data: { pending: 0, publishedToday: 0, remaining: 0 } as QueueCountsView,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useQueueCounts>;
}

function makeMutStub() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
    data: undefined,
    variables: undefined,
  };
}

function renderWithClient(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseSource: CryptoNewsSource = {
  channelId: 'WatcherGuru',
  handle: '@WatcherGuru',
  title: 'WatcherGuru',
  isActive: true,
  lifecycleStatus: 'ACTIVE',
  addedAt: '2025-01-01T00:00:00.000Z',
};

function makeMessagesQuery(data: ReadonlyArray<CryptoNewsMessage>) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCryptoNewsMessages>;
}

function makeSourcesQuery(data: ReadonlyArray<CryptoNewsSource>) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCryptoNewsSources>;
}

function makeLlmConfigQuery(data: LlmConfig) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useLlmConfig>;
}

function makeLlmConfigLoading() {
  return {
    data: undefined,
    isLoading: true,
    error: null,
  } as unknown as ReturnType<typeof useLlmConfig>;
}

function makeLlmConfigError(err: Error) {
  return {
    data: undefined,
    isLoading: false,
    error: err,
  } as unknown as ReturnType<typeof useLlmConfig>;
}

function makeLlmModelsQuery(data: ReadonlyArray<LlmModel>) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useLlmModels>;
}

function makeTemplatesQuery(data: ReadonlyArray<PromptTemplate>) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useTemplates>;
}

function makeEmptyTemplatesQuery() {
  return {
    data: [] as ReadonlyArray<PromptTemplate>,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useTemplates>;
}

const baseConfig: LlmConfig = {
  id: 1,
  defaultTemplateId: 'tpl-default',
  targetChannel: '@vip-channel',
  matchingEnabled: true,
  llmEnabled: true,
  publishingEnabled: true,
  rejectNonLatin: true,
  dailyCap: 36,
  dailyResetUtcHour: 4,
  randomDelayMinMs: 30_000,
  randomDelayMaxMs: 120_000,
  llmMaxAttempts: 3,
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const baseTemplates: ReadonlyArray<PromptTemplate> = [
  {
    id: 'tpl-default',
    name: 'Default (imported)',
    description: 'Seeded from migration',
    model: 'gpt-4o-mini',
    supportsVision: true,
    maxTokens: 2000,
    temperature: 0.7,
    reasoningEffort: null,
    promptText: 'Rewrite: {{title}} | {{original}} | {{hasImage}}',
    systemPromptText: 'You are a crypto journalist.',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl-clickbait',
    name: 'Clickbait',
    description: 'Headline style',
    model: 'gpt-4o-mini',
    supportsVision: true,
    maxTokens: 1500,
    temperature: 1.0,
    reasoningEffort: 'low',
    promptText: 'Headline: {{title}}',
    systemPromptText: '',
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

const baseModels: ReadonlyArray<LlmModel> = [
  { id: 'gpt-4o-mini', ownedBy: 'openai' },
  { id: 'gpt-4o', ownedBy: 'openai' },
  { id: 'claude-3-haiku', ownedBy: 'anthropic' },
];

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseKeywords.mockReturnValue(makeEmptyKeywordsQuery());
  mockedUseQueue.mockReturnValue(makeEmptyQueueQuery());
  mockedUseQueueCounts.mockReturnValue(makeZeroCountsQuery());
  mockedUseCreateKeyword.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useCreateKeyword>,
  );
  mockedUseUpdateKeyword.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useUpdateKeyword>,
  );
  mockedUseDeleteKeyword.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useDeleteKeyword>,
  );
  mockedUseLlmConfig.mockReturnValue(makeLlmConfigQuery(baseConfig));
  mockedUseLlmModels.mockReturnValue(makeLlmModelsQuery(baseModels));
  mockedUseTemplates.mockReturnValue(makeTemplatesQuery(baseTemplates));
  mockedUseUpdateLlmConfig.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useUpdateLlmConfig>,
  );
  mockedUseCreateTemplate.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useCreateTemplate>,
  );
  mockedUseUpdateTemplate.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useUpdateTemplate>,
  );
  mockedUseDeleteTemplate.mockReturnValue(
    makeMutStub() as unknown as ReturnType<typeof useDeleteTemplate>,
  );
});

describe('LlmConfigForm', () => {
  it('renders existing values into the form fields', () => {
    renderWithClient(<LlmConfigForm />);
    expect(screen.getByLabelText('Default template')).toHaveValue(
      'tpl-default',
    );
    expect(screen.getByLabelText('Target Telegram channel')).toHaveValue(
      '@vip-channel',
    );
    expect(screen.getByLabelText('Publisher enabled')).toBeChecked();
    expect(screen.getByLabelText('Daily cap (1-200)')).toHaveValue(36);
    expect(screen.getByLabelText('Daily reset UTC hour (0-23)')).toHaveValue(4);
    expect(screen.getByLabelText('Random delay min (ms)')).toHaveValue(30000);
    expect(screen.getByLabelText('Random delay max (ms)')).toHaveValue(120000);
    expect(screen.getByLabelText('LLM max attempts (1-10)')).toHaveValue(3);
  });

  it('disables the submit button while the update mutation is pending', () => {
    mockedUseUpdateLlmConfig.mockReturnValue({
      ...makeMutStub(),
      isPending: true,
    } as unknown as ReturnType<typeof useUpdateLlmConfig>);
    renderWithClient(<LlmConfigForm />);
    const btn = screen.getByRole('button', { name: /saving…/i });
    expect(btn).toBeDisabled();
  });

  it('shows a "Cargando..." placeholder while useLlmConfig is loading', () => {
    mockedUseLlmConfig.mockReturnValue(makeLlmConfigLoading());
    renderWithClient(<LlmConfigForm />);
    expect(screen.getByText(/Cargando\.\.\./)).toBeInTheDocument();
  });

  it('shows an error message when the config fails to load', () => {
    mockedUseLlmConfig.mockReturnValue(makeLlmConfigError(new Error('boom')));
    renderWithClient(<LlmConfigForm />);
    expect(
      screen.getByText(/Failed to load LLM config: Error: boom/),
    ).toBeInTheDocument();
  });

  it('calls useUpdateLlmConfig with the form values on save', () => {
    const mutateSpy = vi.fn();
    mockedUseUpdateLlmConfig.mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      reset: vi.fn(),
      data: undefined,
      variables: undefined,
    } as unknown as ReturnType<typeof useUpdateLlmConfig>);

    renderWithClient(<LlmConfigForm />);

    fireEvent.change(screen.getByLabelText('Target Telegram channel'), {
      target: { value: '@new-channel' },
    });
    fireEvent.change(screen.getByLabelText('Daily cap (1-200)'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTemplateId: 'tpl-default',
        targetChannel: '@new-channel',
        dailyCap: 12,
        dailyResetUtcHour: 4,
        randomDelayMinMs: 30000,
        randomDelayMaxMs: 120000,
        llmMaxAttempts: 3,
      }),
    );
  });
});

describe('PromptTemplates', () => {
  it('renders a row for each template with its key fields', () => {
    renderWithClient(<PromptTemplates />);
    expect(screen.getByText('Prompt templates (2)')).toBeInTheDocument();
    expect(screen.getByText('Default (imported)')).toBeInTheDocument();
    expect(screen.getByText('Clickbait')).toBeInTheDocument();
    expect(screen.getAllByText('gpt-4o-mini')).toHaveLength(2);
    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('disables delete on the default template and shows the reason', () => {
    renderWithClient(<PromptTemplates />);
    // The default template's delete button is disabled. There are
    // two templates so two delete buttons; the first (default) is
    // disabled, the second (clickbait) is enabled.
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();
    expect(
      screen.getByText(/set as default in LlmConfig/i),
    ).toBeInTheDocument();
  });

  it('disables delete on a template that is bound to any keyword', () => {
    const keywords: ReadonlyArray<KeywordView> = [
      {
        id: 'kw-1',
        phrase: 'halving',
        caseSensitive: false,
        enabled: true,
        sourceChannelIds: [],
        andGroupId: null,
        requireMedia: false,
        matchMode: 'exact',
        templateId: 'tpl-clickbait',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    mockedUseKeywords.mockReturnValue(makeKeywordsQuery(keywords));
    renderWithClient(<PromptTemplates />);
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    // Default template is disabled (in-use by config)
    expect(deleteButtons[0]).toBeDisabled();
    // Clickbait template is disabled (bound to 1 keyword)
    expect(deleteButtons[1]).toBeDisabled();
    expect(screen.getByText(/bound to 1 keyword/i)).toBeInTheDocument();
  });

  it('opens the create modal and submits the form via the create mutation', async () => {
    const mutateSpy = vi.fn((_body, opts) => {
      opts?.onSuccess?.();
    });
    mockedUseCreateTemplate.mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      reset: vi.fn(),
      data: undefined,
      variables: undefined,
    } as unknown as ReturnType<typeof useCreateTemplate>);

    renderWithClient(<PromptTemplates />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New template/i }));

    expect(
      screen.getByRole('heading', { name: 'New prompt template' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name (1-100)'), {
      target: { value: 'Newsroom' },
    });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Newspaper tone' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'gpt-4o-mini' },
    });
    fireEvent.change(screen.getByLabelText('Max tokens (1-8000)'), {
      target: { value: '1200' },
    });
    fireEvent.change(screen.getByLabelText('Temperature (0-2, step 0.1)'), {
      target: { value: '0.4' },
    });
    fireEvent.change(screen.getByLabelText('Reasoning effort'), {
      target: { value: 'low' },
    });
    fireEvent.change(
      screen.getByLabelText('System prompt (persona, role, style)'),
      {
        target: { value: 'You are a newsroom editor.' },
      },
    );
    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: {
        value: 'Rewrite the following for our newsroom: {{original}}',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => {
      expect(mutateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Newsroom',
          description: 'Newspaper tone',
          model: 'gpt-4o-mini',
          maxTokens: 1200,
          temperature: 0.4,
          reasoningEffort: 'low',
          systemPromptText: 'You are a newsroom editor.',
          promptText: 'Rewrite the following for our newsroom: {{original}}',
        }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  it('renders two textareas (system + prompt) in the create modal', () => {
    renderWithClient(<PromptTemplates />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New template/i }));

    const systemTextarea = screen.getByLabelText(
      'System prompt (persona, role, style)',
    );
    const promptTextarea = screen.getByLabelText('Prompt template');

    expect(systemTextarea.tagName.toLowerCase()).toBe('textarea');
    expect(promptTextarea.tagName.toLowerCase()).toBe('textarea');
    expect(systemTextarea).toHaveValue('');
  });

  it('shows a "Has system prompt" indicator for templates that define one', () => {
    renderWithClient(<PromptTemplates />);
    expect(screen.getByText(/Has system prompt/i)).toBeInTheDocument();
  });

  it('shows a window.confirm dialog when clicking delete on a non-default, unused template', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const mutateSpy = vi.fn();
    mockedUseDeleteTemplate.mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      reset: vi.fn(),
      data: undefined,
      variables: undefined,
    } as unknown as ReturnType<typeof useDeleteTemplate>);

    // Move default to the clickbait template so we can test deleting
    // the "default (imported)" row, which becomes a non-default
    // template.
    const cfg: LlmConfig = {
      ...baseConfig,
      defaultTemplateId: 'tpl-clickbait',
    };
    mockedUseLlmConfig.mockReturnValue(makeLlmConfigQuery(cfg));

    renderWithClient(<PromptTemplates />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    // First row is now the imported/default (not the clickbait); it's
    // bound to 0 keywords. The second row (clickbait) is the new
    // default, so it's disabled.
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mutateSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('renders an empty-state message when no templates exist', () => {
    mockedUseTemplates.mockReturnValue(makeEmptyTemplatesQuery());
    renderWithClient(<PromptTemplates />);
    expect(
      screen.getByText(/No templates yet\. Create one to start publishing/i),
    ).toBeInTheDocument();
  });
});

describe('CryptoNewsPage — LLM section integration', () => {
  beforeEach(() => {
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([]));
  });

  it('renders the LLM Configuration section in the right column', () => {
    renderWithClient(<CryptoNewsPage />);
    // Both the page summary and the LLMConfigForm h2 say
    // "Default LLM settings"; the form h2 is what we want.
    expect(
      screen.getByRole('heading', { name: 'Default LLM settings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Prompt templates \(\d+\)/ }),
    ).toBeInTheDocument();
  });

  it('keyword row shows the resolved template label', () => {
    const keywords: ReadonlyArray<KeywordView> = [
      {
        id: 'kw-1',
        phrase: 'SEC',
        caseSensitive: false,
        enabled: true,
        sourceChannelIds: [],
        andGroupId: null,
        requireMedia: false,
        matchMode: 'exact',
        templateId: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'kw-2',
        phrase: 'halving',
        caseSensitive: false,
        enabled: true,
        sourceChannelIds: [],
        andGroupId: null,
        requireMedia: false,
        matchMode: 'exact',
        templateId: 'tpl-clickbait',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    mockedUseKeywords.mockReturnValue(makeKeywordsQuery(keywords));
    renderWithClient(<CryptoNewsPage />);

    // First row uses default, second uses the clickbait template
    // resolved by id.
    const defaultCells = screen.getAllByText('Default');
    expect(defaultCells.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Template: Clickbait')).toBeInTheDocument();
  });

  it('keyword create form includes a Template dropdown', async () => {
    renderWithClient(<CryptoNewsPage />);
    // Open the add-keyword modal via the unified Add Phrase dropdown
    fireEvent.click(
      screen.getAllByRole('button', { name: /\+ Add Phrase/i })[0],
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Keyword \(simple\)/i }),
    );
    const select = (await screen.findByLabelText(
      'Template',
    )) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    // The dropdown includes both templates from baseTemplates.
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('Use global default');
    expect(options).toContain('Default (imported)');
    expect(options).toContain('Clickbait');
  });

  it('submits the create-keyword form with the selected templateId', async () => {
    const mutateSpy = vi.fn((_body, opts) => {
      opts?.onSuccess?.();
    });
    mockedUseCreateKeyword.mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      reset: vi.fn(),
      data: undefined,
      variables: undefined,
    } as unknown as ReturnType<typeof useCreateKeyword>);

    renderWithClient(<CryptoNewsPage />);

    // Open the add-keyword modal via the unified Add Phrase dropdown
    fireEvent.click(
      screen.getAllByRole('button', { name: /\+ Add Phrase/i })[0],
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Keyword \(simple\)/i }),
    );

    fireEvent.change(await screen.findByPlaceholderText(/e\.g\./), {
      target: { value: 'FOMC' },
    });
    fireEvent.change(await screen.findByLabelText('Template'), {
      target: { value: 'tpl-clickbait' },
    });
    // Submit via the modal's Save button (scoped to the modal form)
    const modalForm = (await screen.findByPlaceholderText(/e\.g\./)).closest(
      'form',
    )!;
    const saveBtn = modalForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    fireEvent.click(saveBtn);

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phrase: 'FOMC',
        caseSensitive: false,
        templateId: 'tpl-clickbait',
        matchMode: 'exact',
        enabled: true,
        requireMedia: false,
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
