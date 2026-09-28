// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as profile from '@/entities/profile';
import { ProfilesPage } from '../index';

const PROFILE = {
  id: 'desk-alpha',
  name: 'Desk Alpha',
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

function mockAll() {
  vi.spyOn(profile, 'useProfiles').mockReturnValue({
    data: [PROFILE],
  } as unknown as ReturnType<typeof profile.useProfiles>);
  vi.spyOn(profile, 'useProfileTemplates').mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof profile.useProfileTemplates>);
  vi.spyOn(profile, 'useCreateProfile').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof profile.useCreateProfile>);
  vi.spyOn(profile, 'useUpdateProfile').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof profile.useUpdateProfile>);
  vi.spyOn(profile, 'useToggleProfileSource').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof profile.useToggleProfileSource>);
  vi.spyOn(profile, 'useActivateProfile').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof profile.useActivateProfile>);
  vi.spyOn(profile, 'useDeactivateProfile').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof profile.useDeactivateProfile>);
  vi.spyOn(profile, 'useDeleteProfile').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof profile.useDeleteProfile>);
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
  vi.spyOn(profile, 'useToggleChannelFilter').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof profile.useToggleChannelFilter>);
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

describe('ProfilesPage (Tramo 2, todo 16)', () => {
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
    return render(<ProfilesPage />, { wrapper });
  }

  it('renders the profile header with the active profile name', () => {
    renderPage();
    const header = screen.getByTestId('profiles-header');
    expect(header).toHaveTextContent('[Profile: Desk Alpha]');
    expect(header.className).toMatch(/sticky/);
  });

  it('keeps menu and header sticky', () => {
    renderPage();
    expect(screen.getByTestId('profiles-menu').className).toMatch(/sticky/);
  });

  it('renders all six tabs', () => {
    renderPage();
    for (const tab of [
      'sources',
      'keywords',
      'queue',
      'target',
      'filters',
      'llm',
    ]) {
      expect(screen.getByTestId(`profile-tab-${tab}`)).toBeInTheDocument();
    }
  });

  it('validates profile names and previews the normalized id', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('manage-profile-button'));
    const input = screen.getByTestId('profile-name-input');
    fireEvent.change(input, { target: { value: 'My New Desk!!' } });
    // Normalized preview is dedup-friendly (lowercase + dashes).
    expect(screen.getByTestId('profile-id-preview')).toHaveTextContent(
      'my-new-desk',
    );
    fireEvent.change(input, { target: { value: '-bad-' } });
    expect(screen.getByTestId('profile-name-error')).toBeInTheDocument();
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
    render(<ProfilesPage />, { wrapper });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByTestId('profiles-header')).toHaveTextContent(
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

  it('renders paginated keyword preview tables (allowed/block/compound)', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('profile-tab-keywords'));
    expect(screen.getByTestId('keywords-allowed-table')).toHaveTextContent(
      'etf',
    );
    expect(screen.getByTestId('keywords-blocked-table')).toHaveTextContent(
      'scam',
    );
    expect(screen.getByTestId('keywords-allowed-page')).toBeInTheDocument();
  });

  it('renders the llm config section', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('profile-tab-llm'));
    expect(screen.getByTestId('llm-config-section')).toHaveTextContent(
      'full-pipeline',
    );
  });

  it('renders per-source toggles in the sources tab', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('profile-tab-sources'));
    expect(screen.getByTestId('source-toggle--1001')).toBeInTheDocument();
    expect(screen.getByTestId('source-toggle--1002')).toBeInTheDocument();
  });
});
