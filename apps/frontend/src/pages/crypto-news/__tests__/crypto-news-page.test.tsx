// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/entities/crypto-news/model/use-crypto-news', () => ({
  useCryptoNewsMessages: vi.fn(),
  useCryptoNewsSources: vi.fn(),
}));

vi.mock('@/features/crypto-news-publisher/model/use-keywords', () => ({
  useKeywords: vi.fn(),
  useCreateKeyword: vi.fn(),
  useUpdateKeyword: vi.fn(),
  useDeleteKeyword: vi.fn(),
}));

vi.mock('@/features/crypto-news-publisher/model/use-queue', () => ({
  useQueue: vi.fn(),
  useQueueCounts: vi.fn(),
  useCancelQueueEntry: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  })),
}));

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
import { CryptoNewsPage } from '../index';
import type {
  CryptoNewsMessage,
  CryptoNewsSource,
} from '@/entities/crypto-news/api/crypto-news-queries';
import type { KeywordView } from '@/features/crypto-news-publisher/api/keywords-api';
import type {
  QueueCountsView,
  QueueEntryView,
} from '@/features/crypto-news-publisher/api/queue-api';

const mockedUseMessages = vi.mocked(useCryptoNewsMessages);
const mockedUseSources = vi.mocked(useCryptoNewsSources);
const mockedUseKeywords = vi.mocked(useKeywords);
const mockedUseQueue = vi.mocked(useQueue);
const mockedUseQueueCounts = vi.mocked(useQueueCounts);
const mockedUseCreateKeyword = vi.mocked(useCreateKeyword);
const mockedUseUpdateKeyword = vi.mocked(useUpdateKeyword);
const mockedUseDeleteKeyword = vi.mocked(useDeleteKeyword);

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

function makeQueueQuery(data: ReadonlyArray<QueueEntryView>) {
  return {
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useQueue>;
}

function makeCountsQuery(data: QueueCountsView) {
  return {
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useQueueCounts>;
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
});

describe('CryptoNewsPage — media rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  it('renders <img> for each media item with correct src and alt', () => {
    const msgWithMedia: CryptoNewsMessage = {
      id: 'msg-1',
      channelId: 'WatcherGuru',
      messageId: 42,
      title: 'BTC pump incoming',
      content: 'Some content here.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [
        {
          id: 'media-1',
          index: 0,
          type: 'photo',
          url: '/api/crypto-news/media/media-1',
          mimeType: 'image/jpeg',
        },
        {
          id: 'media-2',
          index: 1,
          type: 'photo',
          url: '/api/crypto-news/media/media-2',
          mimeType: 'image/png',
        },
      ],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithMedia]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const imgs = within(article).getAllByRole('img');

    expect(imgs).toHaveLength(2);

    expect(imgs[0]).toHaveAttribute('src', '/api/crypto-news/media/media-1');
    expect(imgs[0]).toHaveAttribute('alt', 'BTC pump incoming 1');
    expect(imgs[0]).toHaveAttribute('loading', 'lazy');

    expect(imgs[1]).toHaveAttribute('src', '/api/crypto-news/media/media-2');
    expect(imgs[1]).toHaveAttribute('alt', 'BTC pump incoming 2');
  });

  it('renders no <img> when media array is empty', () => {
    const msgWithoutMedia: CryptoNewsMessage = {
      id: 'msg-2',
      channelId: 'WatcherGuru',
      messageId: 43,
      title: 'Plain text only',
      content: 'No images here.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithoutMedia]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    expect(within(article).queryByRole('img')).toBeNull();
    // Content is still rendered
    expect(within(article).getByText('No images here.')).toBeInTheDocument();
  });

  it('handles backward-compat case where media is undefined (no crash, no <img>)', () => {
    const legacyMsg = {
      id: 'msg-3',
      channelId: 'WatcherGuru',
      messageId: 44,
      title: 'Legacy message',
      content: 'Pre-media-feature payload.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      // media field intentionally absent (legacy payload)
    } as unknown as CryptoNewsMessage;

    mockedUseMessages.mockReturnValue(makeMessagesQuery([legacyMsg]));

    // Must not throw
    expect(() => renderWithClient(<CryptoNewsPage />)).not.toThrow();

    const article = screen.getByRole('article');
    expect(within(article).queryByRole('img')).toBeNull();
    expect(
      within(article).getByText('Pre-media-feature payload.'),
    ).toBeInTheDocument();
  });
});

describe('CryptoNewsPage — source handle/link rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders message with source handle as clickable link to public Telegram URL', () => {
    const sourceWithHandle: CryptoNewsSource = {
      channelId: '123',
      handle: '@test-handle',
      title: 'Test Source',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgWithHandle: CryptoNewsMessage = {
      id: 'msg-1',
      channelId: '123',
      messageId: 5,
      title: 'Test Message',
      content: 'Content here.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceWithHandle]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithHandle]));

    renderWithClient(<CryptoNewsPage />);

    const link = screen.getByRole('link', { name: /test-handle/i });
    expect(link).toHaveAttribute('href', 'https://t.me/test-handle/5');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders message with source no handle (private channel) using c/ URL format', () => {
    const sourceNoHandle: CryptoNewsSource = {
      channelId: '123',
      handle: null,
      title: 'Test Channel',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgNoHandle: CryptoNewsMessage = {
      id: 'msg-2',
      channelId: '123',
      messageId: 5,
      title: 'Private Message',
      content: 'Secret content.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceNoHandle]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgNoHandle]));

    renderWithClient(<CryptoNewsPage />);

    const link = screen.getByRole('link', { name: /Test Channel/i });
    expect(link).toHaveAttribute('href', 'https://t.me/c/123/5');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders source not found - falls back to raw channelId without link', () => {
    const otherSource: CryptoNewsSource = {
      channelId: 'other-channel',
      handle: '@OtherChannel',
      title: 'Other Channel',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgUnknown: CryptoNewsMessage = {
      id: 'msg-3',
      channelId: 'unknown-channel',
      messageId: 99,
      title: 'Unknown Message',
      content: 'Some content.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([otherSource]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgUnknown]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    expect(within(article).getByText('unknown-channel')).toBeInTheDocument();
    const links = within(article).queryAllByRole('link');
    expect(links).toHaveLength(0);
  });
});

describe('CryptoNewsPage — formatting entities rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  it('renders text_url entity as anchor link', () => {
    const msgWithLink: CryptoNewsMessage = {
      id: 'msg-link',
      channelId: 'WatcherGuru',
      messageId: 100,
      title: 'Link test',
      content: 'Check out this site click here for more info',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: [
        {
          offset: 20,
          length: 10,
          type: 'text_url',
          url: 'https://example.com',
        },
      ],
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithLink]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const allLinks = within(article).getAllByRole('link');
    const contentLink = allLinks.find(
      (l) => l.getAttribute('href') === 'https://example.com',
    );
    expect(contentLink).toBeDefined();
    expect(contentLink).toHaveAttribute('target', '_blank');
    expect(contentLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders text without entities as plain text (no anchor tags)', () => {
    const sourceNoHandle: CryptoNewsSource = {
      channelId: '123456',
      handle: null,
      title: 'No Handle Channel',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgPlainText: CryptoNewsMessage = {
      id: 'msg-plain',
      channelId: '123456',
      messageId: 101,
      title: 'Plain text test',
      content: 'This is just plain text with no formatting.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceNoHandle]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgPlainText]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const contentPara = within(article).getByText(
      'This is just plain text with no formatting.',
    );
    expect(contentPara).toBeInTheDocument();
    expect(contentPara).not.toHaveAttribute('href');
  });
});

describe('CryptoNewsPage — publisher (keywords + queue)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([]));
    mockedUseCreateKeyword.mockReturnValue(
      makeMutStub() as unknown as ReturnType<typeof useCreateKeyword>,
    );
    mockedUseUpdateKeyword.mockReturnValue(
      makeMutStub() as unknown as ReturnType<typeof useUpdateKeyword>,
    );
    mockedUseDeleteKeyword.mockReturnValue(
      makeMutStub() as unknown as ReturnType<typeof useDeleteKeyword>,
    );
  });

  it('renders keyword rows with phrase, case-sensitive flag, and enabled toggle', () => {
    const keywords: ReadonlyArray<KeywordView> = [
      {
        id: 'kw-1',
        phrase: 'SEC',
        caseSensitive: true,
        enabled: true,
        sourceChannelIds: [],
        andGroupId: null,
        requireMedia: false,
        templateId: null,
        matchMode: 'exact',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'kw-2',
        phrase: 'halving',
        caseSensitive: false,
        enabled: false,
        sourceChannelIds: [],
        andGroupId: null,
        requireMedia: false,
        templateId: 'tpl-clickbait',
        matchMode: 'exact',
        createdAt: '2025-01-02T03:04:06.000Z',
      },
    ];
    mockedUseKeywords.mockReturnValue(makeKeywordsQuery(keywords));

    renderWithClient(<CryptoNewsPage />);

    expect(screen.getByText('SEC')).toBeInTheDocument();
    expect(screen.getByText('halving')).toBeInTheDocument();
    expect(screen.getByText('Keywords (2)')).toBeInTheDocument();

    const secToggle = screen.getByLabelText('Toggle SEC') as HTMLInputElement;
    expect(secToggle.checked).toBe(true);
    const halvingToggle = screen.getByLabelText(
      'Toggle halving',
    ) as HTMLInputElement;
    expect(halvingToggle.checked).toBe(false);
  });

  it('renders queue counters and queue rows with status badge', () => {
    mockedUseKeywords.mockReturnValue(makeEmptyKeywordsQuery());

    mockedUseQueueCounts.mockReturnValue(
      makeCountsQuery({ pending: 5, publishedToday: 12, remaining: 24 }),
    );

    const queue: ReadonlyArray<QueueEntryView> = [
      {
        id: 'q-1',
        channelId: '-1001234567890',
        sourceHandle: 'WatcherGuru',
        sourceTitle: 'Watcher Guru',
        messageId: 777,
        rawTitle: 'ETF approval imminent',
        rawContent: null,
        imagePath: null,
        imagePaths: [],
        groupedId: null,
        matchedKeywordIds: [],
        status: 'PENDING',
        messageReceivedAt: '2025-01-02T03:04:05.000Z',
        publishedAt: null,
        telegramMessageId: null,
        telegramUrl: null,
        lastError: null,
        attempts: 0,
        generatedContent: null,
        generatedSystemPrompt: null,
        generatedUserPrompt: null,
        generatedTemperature: null,
        generatedReasoningEffort: null,
        generatedModel: null,
        blockedReason: null,
      },
      {
        id: 'q-2',
        channelId: '-1001234567890',
        sourceHandle: 'WatcherGuru',
        sourceTitle: 'Watcher Guru',
        messageId: 778,
        rawTitle: null,
        rawContent: null,
        imagePath: null,
        imagePaths: [],
        groupedId: null,
        matchedKeywordIds: [],
        status: 'PUBLISHED',
        messageReceivedAt: '2025-01-02T03:04:06.000Z',
        publishedAt: '2025-01-02T03:10:00.000Z',
        telegramMessageId: 'tg-99',
        telegramUrl: null,
        lastError: null,
        attempts: 1,
        generatedContent: null,
        generatedSystemPrompt: null,
        generatedUserPrompt: null,
        generatedTemperature: null,
        generatedReasoningEffort: null,
        generatedModel: null,
        blockedReason: null,
      },
    ];
    mockedUseQueue.mockReturnValue(makeQueueQuery(queue));

    renderWithClient(<CryptoNewsPage />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();

    expect(screen.getByText('Queue (2)')).toBeInTheDocument();
    expect(screen.getAllByText('ETF approval imminent').length).toBe(2);
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('msg 777')).toBeInTheDocument();
    expect(screen.getByText('msg 778')).toBeInTheDocument();
  });

  it('submits the add-keyword form via the create mutation', async () => {
    const mutateSpy = vi.fn();
    mockedUseCreateKeyword.mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      reset: vi.fn(),
      data: undefined,
    } as unknown as ReturnType<typeof useCreateKeyword>);

    mockedUseKeywords.mockReturnValue(makeEmptyKeywordsQuery());
    mockedUseQueue.mockReturnValue(makeEmptyQueueQuery());
    mockedUseQueueCounts.mockReturnValue(makeZeroCountsQuery());

    renderWithClient(<CryptoNewsPage />);

    // Open the add-keyword modal first
    fireEvent.click(screen.getByRole('button', { name: /\+ Add keyword/i }));

    // Find the modal form via the Phrase input, then click its Save button
    const phraseInput = (await screen.findByLabelText(
      /Phrase/i,
    )) as HTMLInputElement;
    fireEvent.change(phraseInput, { target: { value: 'FOMC' } });
    const modalForm = phraseInput.closest('form')!;
    const submit = modalForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    fireEvent.click(submit);

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phrase: 'FOMC',
        caseSensitive: false,
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

describe('CryptoNewsPage — search filter (free-text)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  function makeMsg(
    messageId: number,
    content: string,
    channelId = baseSource.channelId,
  ): CryptoNewsMessage {
    return {
      id: `m-${messageId}`,
      channelId,
      messageId,
      title: null,
      content,
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };
  }

  it('filters by case-insensitive substring match against message content', () => {
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([
        makeMsg(1, 'Bitcoin breaks 100k'),
        makeMsg(2, 'Ethereum news today'),
        makeMsg(3, 'Bitcoin halving soon'),
      ]),
    );
    renderWithClient(<CryptoNewsPage />);

    const input = screen.getByPlaceholderText(/search messages/i);
    fireEvent.change(input, { target: { value: 'BITCOIN' } });

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(screen.getByText(/Bitcoin breaks 100k/)).toBeInTheDocument();
    expect(screen.getByText(/Bitcoin halving soon/)).toBeInTheDocument();
    expect(screen.queryByText(/Ethereum news today/)).not.toBeInTheDocument();
  });

  it('combines search filter AND source filter (intersection)', () => {
    const sourceA = { ...baseSource, channelId: 'srcA', title: 'Source A' };
    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceA, baseSource]));
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([
        makeMsg(10, 'Bitcoin update', 'srcA'),
        makeMsg(11, 'Bitcoin update'),
      ]),
    );
    renderWithClient(<CryptoNewsPage />);

    const input = screen.getByPlaceholderText(/search messages/i);
    fireEvent.change(input, { target: { value: 'bitcoin' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);

    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'srcA' } });

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(1);
    expect(
      within(articles[0]!).getByText(/Bitcoin update/),
    ).toBeInTheDocument();
  });

  it('shows all messages when search is empty or whitespace', () => {
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([makeMsg(1, 'first'), makeMsg(2, 'second')]),
    );
    renderWithClient(<CryptoNewsPage />);

    expect(screen.getAllByRole('article')).toHaveLength(2);

    const input = screen.getByPlaceholderText(/search messages/i);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});
