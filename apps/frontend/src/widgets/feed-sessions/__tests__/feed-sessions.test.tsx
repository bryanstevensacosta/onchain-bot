// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as profile from '@/entities/feed-session';
import * as feedKeywords from '@/features/feed-publisher/model/use-keywords';
import * as feedBlacklist from '@/features/feed-publisher/model/use-blacklist';
import { FeedSessionsSection } from '../ui/feed-sessions-section';

const PROFILE = {
  id: 'desk-alpha',
  name: 'desk-alpha',
  templateId: null,
  active: true,
  matchingEnabled: true,
  publishingEnabled: true,
  llmEnabled: true,
  keywordIds: ['k1'],
  sourceToggles: { '-1001': true, '-1002': false },
  telegramTargets: [{ botId: 'b1', chatId: '-1009' }],
  threadsTargets: [],
  canConsume: true,
  canPublish: true,
};

const TEMPLATE = {
  id: 't-breakout',
  name: 'Breakout',
  active: true,
  sourceIds: ['-1001'],
  keywordIds: ['k1'],
  promptTemplateId: null,
  targets: ['telegram'],
  botBindings: [{ botId: 'b1', target: 'telegram', chatId: '-1009' }],
  matchingEnabled: true,
  llmEnabled: true,
  publishingEnabled: true,
  scheduleMode: 'live',
  canPublish: true,
};

const SOURCES = [
  {
    channelId: '-1001',
    handle: 'alpha',
    title: 'Alpha',
    isActive: true,
    lifecycleStatus: 'active',
    addedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    channelId: '-1002',
    handle: 'beta',
    title: 'Beta',
    isActive: true,
    lifecycleStatus: 'active',
    addedAt: '2026-09-01T00:00:00.000Z',
  },
];

const KEYWORDS = [
  {
    id: 'k1',
    phrase: 'etf',
    caseSensitive: false,
    sourceChannelIds: [],
    enabled: true,
    andGroupId: null,
    requireMedia: false,
    templateId: null,
    matchMode: 'substring',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

const BLACKLIST = [
  {
    id: 'b1',
    phrase: 'scam',
    caseSensitive: false,
    matchMode: 'substring',
    sourceChannelIds: [],
    enabled: true,
    andGroupId: null,
    requireMedia: false,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

const MESSAGES = [
  {
    id: 'm1',
    channelId: '-1001',
    messageId: 7,
    title: null,
    content: 'spot etf inflows breaking news update more lines here',
    publishedAt: '2026-09-28T00:00:00.000Z',
    ingestedAt: '2026-09-28T00:00:00.000Z',
    media: [],
    linkPreviewUrl: null,
    linkPreviewTitle: null,
    linkPreviewDescription: null,
    linkPreviewSiteName: null,
  },
];

function mockMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  };
}

function mockAll() {
  vi.spyOn(feedKeywords, 'useKeywords').mockReturnValue({
    data: KEYWORDS,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof feedKeywords.useKeywords>);
  for (const hook of [
    'useCreateKeyword',
    'useCreateKeywordBatch',
    'useUpdateKeyword',
    'useDeleteKeyword',
  ] as const) {
    vi.spyOn(feedKeywords, hook).mockReturnValue(
      mockMutation() as unknown as ReturnType<
        (typeof feedKeywords)[typeof hook]
      >,
    );
  }
  vi.spyOn(feedBlacklist, 'useBlacklist').mockReturnValue({
    data: BLACKLIST,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof feedBlacklist.useBlacklist>);
  for (const hook of [
    'useCreateBlacklist',
    'useCreateBlacklistBatch',
    'useUpdateBlacklist',
    'useDeleteBlacklist',
  ] as const) {
    vi.spyOn(feedBlacklist, hook).mockReturnValue(
      mockMutation() as unknown as ReturnType<
        (typeof feedBlacklist)[typeof hook]
      >,
    );
  }
  vi.spyOn(profile, 'useProfiles').mockReturnValue({
    data: [PROFILE],
  } as unknown as ReturnType<typeof profile.useProfiles>);
  vi.spyOn(profile, 'useProfileTemplates').mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof profile.useProfileTemplates>);
  vi.spyOn(profile, 'useCreateProfile').mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof profile.useCreateProfile>,
  );
  vi.spyOn(profile, 'useUpdateProfile').mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof profile.useUpdateProfile>,
  );
  vi.spyOn(profile, 'useToggleProfileSource').mockReturnValue(
    mockMutation() as unknown as ReturnType<
      typeof profile.useToggleProfileSource
    >,
  );
  vi.spyOn(profile, 'useActivateProfile').mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof profile.useActivateProfile>,
  );
  vi.spyOn(profile, 'useDeactivateProfile').mockReturnValue(
    mockMutation() as unknown as ReturnType<
      typeof profile.useDeactivateProfile
    >,
  );
  vi.spyOn(profile, 'useDeleteProfile').mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof profile.useDeleteProfile>,
  );
  vi.spyOn(profile, 'useCreateProfileTemplate').mockReturnValue(
    mockMutation() as unknown as ReturnType<
      typeof profile.useCreateProfileTemplate
    >,
  );
  vi.spyOn(profile, 'useUpdateProfileTemplate').mockReturnValue(
    mockMutation() as unknown as ReturnType<
      typeof profile.useUpdateProfileTemplate
    >,
  );
  vi.spyOn(profile, 'useDeleteProfileTemplate').mockReturnValue(
    mockMutation() as unknown as ReturnType<
      typeof profile.useDeleteProfileTemplate
    >,
  );
  vi.spyOn(profile, 'useProfileSources').mockReturnValue({
    data: SOURCES,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.useProfileSources>);
  vi.spyOn(profile, 'usePublisherKeywords').mockReturnValue({
    data: KEYWORDS,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.usePublisherKeywords>);
  vi.spyOn(profile, 'usePublisherBlacklist').mockReturnValue({
    data: BLACKLIST,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.usePublisherBlacklist>);
  vi.spyOn(profile, 'useProfileQueue').mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.useProfileQueue>);
  vi.spyOn(profile, 'useProfileRecentMessages').mockReturnValue({
    data: MESSAGES,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.useProfileRecentMessages>);
  vi.spyOn(profile, 'useMessageStatus').mockReturnValue({
    data: {
      channelId: '-1001',
      messageId: 7,
      ingested: true,
      matched: true,
      blocked: false,
      matchedKeywords: [{ id: 'k1', phrase: 'etf' }],
      blockedBy: [],
      reasons: ['matched keyword "etf"'],
      filteredTitle: null,
      filteredContent: 'spot etf inflows',
      rawTitle: null,
      rawContent: 'spot etf inflows',
      queue: null,
      badge: 'Pending to publish',
    },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.useMessageStatus>);
  vi.spyOn(profile, 'useChannelFilters').mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.useChannelFilters>);
  vi.spyOn(profile, 'useToggleChannelFilter').mockReturnValue(
    mockMutation() as unknown as ReturnType<
      typeof profile.useToggleChannelFilter
    >,
  );
  vi.spyOn(profile, 'useFiltersPreview').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof profile.useFiltersPreview>);
  vi.spyOn(profile, 'useProfileLlm').mockReturnValue({
    data: {
      config: {
        defaultTemplateId: 't1',
        targetChannel: '-1009',
        llmEnabled: true,
        publishingEnabled: true,
        rejectNonLatin: false,
        dailyCap: 100,
        dailyResetUtcHour: 0,
        randomDelayMinMs: 0,
        randomDelayMaxMs: 0,
        llmMaxAttempts: 3,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      flags: {
        flags: { matching: true, llm: true, publishing: true },
        llmActive: true,
        mode: 'full-pipeline',
      },
    },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof profile.useProfileLlm>);
}

describe('FeedSessionsSection (/feed sessions, ex-/profiles)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderPage() {
    mockAll();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return render(<FeedSessionsSection />, { wrapper });
  }

  it('renders the session header with status picker and no create entry', () => {
    renderPage();
    const header = screen.getByTestId('sessions-header');
    expect(header).toHaveTextContent('Session');
    expect(header.className).toMatch(/sticky/);
    const picker = screen.getByTestId('session-picker');
    expect(picker).toHaveTextContent('● desk-alpha');
    expect(picker).not.toHaveTextContent('＋ Create new session');
  });

  it('shows a red status dot for inactive sessions', () => {
    mockAll();
    vi.spyOn(profile, 'useProfiles').mockReturnValue({
      data: [{ ...PROFILE, active: false }],
    } as unknown as ReturnType<typeof profile.useProfiles>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    expect(screen.getByTestId('session-picker')).toHaveTextContent(
      '○ desk-alpha',
    );
  });

  it('shows Ad-hoc when the session has no template', () => {
    renderPage();
    expect(screen.getByTestId('session-template-name')).toHaveTextContent(
      'template: Ad-hoc',
    );
  });

  it('shows the template name for template-bound sessions', () => {
    mockAll();
    vi.spyOn(profile, 'useProfiles').mockReturnValue({
      data: [{ ...PROFILE, templateId: 't-breakout' }],
    } as unknown as ReturnType<typeof profile.useProfiles>);
    vi.spyOn(profile, 'useProfileTemplates').mockReturnValue({
      data: [TEMPLATE],
    } as unknown as ReturnType<typeof profile.useProfileTemplates>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    expect(screen.getByTestId('session-template-name')).toHaveTextContent(
      'template: Breakout',
    );
  });

  it('keeps menu and header sticky', () => {
    renderPage();
    expect(screen.getByTestId('sessions-menu').className).toMatch(/sticky/);
  });

  it('renders the six P34-ter tabs (overview, no queue tab)', () => {
    renderPage();
    for (const tab of [
      'overview',
      'sources',
      'keywords',
      'filters',
      'llm',
      'target',
    ]) {
      expect(screen.getByTestId(`session-tab-${tab}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('session-tab-queue')).toBeNull();
  });

  it('renders one window with save/delete/activate on select', () => {
    renderPage();
    expect(screen.getByTestId('session-window')).toBeInTheDocument();
    expect(screen.getByTestId('window-save')).toBeInTheDocument();
    expect(screen.getByTestId('window-delete')).toBeInTheDocument();
    expect(screen.getByTestId('window-deactivate')).toBeInTheDocument();
  });

  it('shows per-tab toggles on every tab', () => {
    renderPage();
    for (const tab of [
      'overview',
      'keywords',
      'filters',
      'llm',
      'target',
    ] as const) {
      fireEvent.click(screen.getByTestId(`session-tab-${tab}`));
      expect(
        screen.getByTestId('session-switch-matchingEnabled'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('session-switch-publishingEnabled'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('session-switch-llmEnabled'),
      ).toBeInTheDocument();
    }
  });

  it('stages source toggles without mutating until Save', () => {
    renderPage();
    const toggleSource = vi.mocked(profile.useToggleProfileSource)();
    fireEvent.click(screen.getByTestId('session-tab-sources'));
    fireEvent.click(screen.getByTestId('source-toggle--1002'));
    expect(toggleSource.mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('window-dirty')).toHaveTextContent(
      'Unsaved changes',
    );
    expect(screen.getByTestId('source-staged--1002')).toBeInTheDocument();
    const update = vi.mocked(profile.useUpdateProfile)();
    fireEvent.click(screen.getByTestId('window-save'));
    expect(update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'desk-alpha' }),
    );
  });

  it('asks for confirmation before DB-deleting a session', () => {
    renderPage();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByTestId('window-delete'));
    const remove = vi.mocked(profile.useDeleteProfile)();
    expect(remove.mutate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('window-delete'));
    expect(remove.mutate).toHaveBeenCalledWith('desk-alpha', expect.anything());
  });

  it('lowercases the window session name live', () => {
    renderPage();
    const input = screen.getByTestId('window-session-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My Desk 42' } });
    expect(input.value).toBe('my desk 42');
    expect(screen.getByTestId('window-name-error')).toBeInTheDocument();
  });

  it('opens the target tab from an overview target row', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('overview-target-telegram--1009'));
    expect(screen.getByTestId('target-tab')).toBeInTheDocument();
    expect(screen.getByTestId('target-row-telegram--1009')).toHaveTextContent(
      'bot b1 → -1009',
    );
  });

  it('saves the session config as a new template', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('window-template-name'), {
      target: { value: 'My Template' },
    });
    const create = vi.mocked(profile.useCreateProfileTemplate)();
    fireEvent.click(screen.getByTestId('window-template-save'));
    expect(create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my template',
        keywordIds: ['k1'],
        matchingEnabled: true,
      }),
      expect.anything(),
    );
    const body = vi.mocked(create.mutate).mock.calls[0][0] as unknown as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('telegramTargets');
    expect(body).not.toHaveProperty('threadsTargets');
  });

  it('loads a template into the staged draft with a confirm when dirty', () => {
    mockAll();
    vi.spyOn(profile, 'useProfileTemplates').mockReturnValue({
      data: [{ ...TEMPLATE, matchingEnabled: false }],
    } as unknown as ReturnType<typeof profile.useProfileTemplates>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    fireEvent.change(screen.getByTestId('window-template-select'), {
      target: { value: 't-breakout' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('window-template-load'));
    expect(confirm).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('session-switch-matchingEnabled'),
    ).toHaveTextContent('Matching: off');
  });

  it('deletes a template with an x button behind a confirm', () => {
    mockAll();
    vi.spyOn(profile, 'useProfileTemplates').mockReturnValue({
      data: [TEMPLATE],
    } as unknown as ReturnType<typeof profile.useProfileTemplates>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    fireEvent.change(screen.getByTestId('window-template-select'), {
      target: { value: 't-breakout' },
    });
    const remove = vi.mocked(profile.useDeleteProfileTemplate)();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByTestId('window-template-delete-t-breakout'));
    expect(remove.mutate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('window-template-delete-t-breakout'));
    expect(remove.mutate).toHaveBeenCalledWith('t-breakout', expect.anything());
  });

  it('has no Manage Sessions button (management lives in Overview)', () => {
    renderPage();
    expect(screen.queryByTestId('manage-session-button')).toBeNull();
  });

  it('picker has no create entry (creation lives in Overview)', () => {
    renderPage();
    expect(screen.getByTestId('session-picker')).not.toHaveTextContent(
      '＋ Create new session',
    );
  });

  it('renders session management inline in the Overview tab', () => {
    renderPage();
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
    expect(screen.getByTestId('session-management')).toBeInTheDocument();
    expect(screen.getByTestId('session-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('session-create-button')).toBeInTheDocument();
    expect(screen.getByTestId('session-delete-desk-alpha')).toBeInTheDocument();
  });

  it('validates profile names and previews the normalized id inline', () => {
    renderPage();
    const input = screen.getByTestId('session-name-input');
    fireEvent.change(input, { target: { value: 'My New Desk!!' } });
    expect((input as HTMLInputElement).value).toBe('my new desk!!');
    expect(screen.getByTestId('session-id-preview')).toHaveTextContent(
      'my-new-desk',
    );
    fireEvent.change(input, { target: { value: '-bad-' } });
    expect(screen.getByTestId('session-name-error')).toBeInTheDocument();
  });

  it('blocks duplicate session ids inline', () => {
    renderPage();
    const input = screen.getByTestId('session-name-input');
    fireEvent.change(input, { target: { value: 'desk-alpha' } });
    expect(screen.getByTestId('session-name-error')).toHaveTextContent(
      'already exists',
    );
    expect(screen.getByTestId('session-create-button')).toBeDisabled();
  });

  it('creates a session inline with the normalized id', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('session-name-input'), {
      target: { value: 'Desk Beta' },
    });
    const create = vi.mocked(profile.useCreateProfile)();
    fireEvent.click(screen.getByTestId('session-create-button'));
    expect(create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'desk-beta' }),
      expect.anything(),
    );
  });

  it('asks for confirmation before deleting a session from the Overview list', () => {
    renderPage();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByTestId('session-delete-desk-alpha'));
    const remove = vi.mocked(profile.useDeleteProfile)();
    expect(remove.mutate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('session-delete-desk-alpha'));
    expect(remove.mutate).toHaveBeenCalledWith('desk-alpha', expect.anything());
  });

  it('switching sessions from the Overview list asks when dirty', () => {
    mockAll();
    vi.spyOn(profile, 'useProfiles').mockReturnValue({
      data: [PROFILE, { ...PROFILE, id: 'desk-beta', name: 'desk-beta' }],
    } as unknown as ReturnType<typeof profile.useProfiles>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    fireEvent.change(screen.getByTestId('window-session-name'), {
      target: { value: 'desk-alpha-dirty' },
    });
    expect(screen.getByTestId('window-dirty')).toBeInTheDocument();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByTestId('session-select-desk-beta'));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByTestId('window-session-name')).toHaveValue(
      'desk-alpha-dirty',
    );
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('session-select-desk-beta'));
    expect(screen.getByTestId('window-session-name')).toHaveValue('desk-beta');
  });

  it('switching tabs asks when the session draft is dirty', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('session-tab-sources'));
    fireEvent.click(screen.getByTestId('source-toggle--1002'));
    expect(screen.getByTestId('window-dirty')).toBeInTheDocument();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByTestId('session-tab-overview'));
    expect(confirm).toHaveBeenCalled();
    expect(screen.queryByTestId('overview-tab')).toBeNull();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('session-tab-overview'));
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
  });

  it('renders profile names as text (XSS-safe)', () => {
    mockAll();
    vi.spyOn(profile, 'useProfiles').mockReturnValue({
      data: [{ ...PROFILE, name: '<img src=x onerror=alert(1)>' }],
    } as unknown as ReturnType<typeof profile.useProfiles>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByTestId('session-picker')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('renders status badges on recent messages with a 3-line clamp', () => {
    renderPage();
    expect(screen.getByTestId('status-badge--1001-7')).toHaveTextContent(
      'Pending to publish',
    );
    expect(screen.getByTestId('recent-item--1001-7').className).toMatch(
      /line-clamp-3/,
    );
  });

  it('opens a fixed scrollable details modal', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('recent-open--1001-7'));
    const dialog = screen.getByTestId('recent-details-modal');
    expect(dialog.className).toMatch(/fixed/);
    expect(screen.getByTestId('recent-details-body').className).toMatch(
      /overflow-y-auto/,
    );
  });

  it('renders session-scoped keywords CRUD inside the Keywords tab', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('session-tab-keywords'));
    expect(screen.getByTestId('session-keywords-scope')).toHaveTextContent(
      'desk-alpha',
    );
    expect(screen.getByTestId('session-keywords-scope')).toHaveTextContent(
      '1 bound',
    );
    expect(screen.getByTestId('session-blacklist-scope')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /\+ Add Phrase/i }).length,
    ).toBeGreaterThan(0);
  });

  it('scopes the Keywords tab preview to the session keywordIds', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('session-tab-keywords'));
    expect(screen.getByTestId('keywords-allowed-table')).toHaveTextContent(
      'etf',
    );
  });

  it('shows a session empty state when no keywords are bound', () => {
    mockAll();
    vi.spyOn(feedKeywords, 'useKeywords').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof feedKeywords.useKeywords>);
    vi.spyOn(profile, 'useProfiles').mockReturnValue({
      data: [{ ...PROFILE, keywordIds: [] }],
    } as unknown as ReturnType<typeof profile.useProfiles>);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<FeedSessionsSection />, { wrapper });
    fireEvent.click(screen.getByTestId('session-tab-keywords'));
    expect(screen.getByTestId('session-keywords-empty')).toBeInTheDocument();
  });

  it('renders the llm config section', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('session-tab-llm'));
    expect(screen.getByTestId('llm-config-section')).toHaveTextContent(
      'full-pipeline',
    );
  });

  it('renders per-source toggles in the sources tab plus global CRUD entry', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('session-tab-sources'));
    expect(screen.getByTestId('source-toggle--1001')).toBeInTheDocument();
    expect(screen.getByTestId('source-toggle--1002')).toBeInTheDocument();
    expect(screen.getByTestId('sources-manage-button')).toBeInTheDocument();
  });
});
