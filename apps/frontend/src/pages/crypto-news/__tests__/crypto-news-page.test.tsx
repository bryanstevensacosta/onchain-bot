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
import { CryptoNewsPage, TRUNCATION_LIMIT } from '../index';
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

  it('renders <video> for media with type video even when mimeType is application/octet-stream', () => {
    const msgWithVideo: CryptoNewsMessage = {
      id: 'msg-video',
      channelId: 'WatcherGuru',
      messageId: 45,
      title: 'Video message',
      content: 'A video attachment.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [
        {
          id: 'media-video',
          index: 0,
          type: 'video',
          url: '/crypto-news/media/media-video',
          mimeType: 'application/octet-stream',
        },
        {
          id: 'media-photo',
          index: 1,
          type: 'photo',
          url: '/crypto-news/media/media-photo',
          mimeType: 'image/jpeg',
        },
      ],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithVideo]));

    const { container } = renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const video = container.querySelector('video');

    expect(video).not.toBeNull();
    const sourceEl = video!.querySelector('source');
    expect(sourceEl).toHaveAttribute('src', '/crypto-news/media/media-video');
    expect(sourceEl).toHaveAttribute('type', 'video/mp4');

    const imgs = within(article).getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', '/crypto-news/media/media-photo');
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

  it('renders queue video media as <video> instead of broken <img>', () => {
    mockedUseKeywords.mockReturnValue(makeEmptyKeywordsQuery());

    const queue: ReadonlyArray<QueueEntryView> = [
      {
        id: 'q-video',
        channelId: '1375055530',
        sourceHandle: 'CoinBureau',
        sourceTitle: 'Coin Bureau',
        messageId: 17856,
        rawTitle: null,
        rawContent: null,
        imagePath: '/app/uploads/crypto-news/media/1375055530/17856_0.bin',
        imagePaths: ['/app/uploads/crypto-news/media/1375055530/17856_0.bin'],
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

    const { container } = renderWithClient(<CryptoNewsPage />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.querySelector('source')).toHaveAttribute(
      'src',
      '/crypto-news-publisher/queue/q-video/media?index=0',
    );
    // No <img> should render for the video path
    // No <img> should render for the video path
    const queueImgs = Array.from(container.querySelectorAll('img')).filter(
      (img) => img.src.includes('queue/q-video'),
    );
    expect(queueImgs).toHaveLength(0);
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

    // Open the add-keyword modal via the unified Add Phrase dropdown
    fireEvent.click(
      screen.getAllByRole('button', { name: /\+ Add Phrase/i })[0],
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Keyword \(simple\)/i }),
    );

    // Find the modal form via the Phrase input, then click its Save button
    const phraseInput = (await screen.findByPlaceholderText(
      /e\.g\./,
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

  it('pre-fills the edit modal with the keyword values instead of stale defaults', () => {
    const keywords: ReadonlyArray<KeywordView> = [
      {
        id: 'kw-1',
        phrase: 'telegram',
        caseSensitive: true,
        enabled: true,
        sourceChannelIds: ['WatcherGuru'],
        andGroupId: null,
        requireMedia: false,
        templateId: null,
        matchMode: 'substring',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    mockedUseKeywords.mockReturnValue(makeKeywordsQuery(keywords));

    renderWithClient(<CryptoNewsPage />);

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));

    const heading = screen.getByRole('heading', { name: 'Edit Keyword' });
    const modal = heading.closest('.fixed') as HTMLElement;

    // Phrase input is pre-filled with the keyword's phrase
    expect(within(modal).getByDisplayValue('telegram')).toBeInTheDocument();

    // Source selector shows the specific source, not the "All sources" default
    expect(
      within(modal).getByRole('button', { name: 'WatcherGuru' }),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByText('All sources (global)'),
    ).not.toBeInTheDocument();

    // Match mode reflects the keyword value (substring), not the create default
    const matchSelect = within(modal).getByDisplayValue(
      'Substring',
    ) as HTMLSelectElement;
    expect(matchSelect.value).toBe('substring');
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

describe('CryptoNewsPage — expand/collapse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  // Deterministic content (`_TAIL_UNIQUE_` lives beyond the truncation boundary)
  // lets tests assert substring presence/absence across the 500-char cutoff.
  function makeLongMsg(
    messageId: number,
    overrides: Partial<CryptoNewsMessage> = {},
  ): CryptoNewsMessage {
    return {
      id: `m-${messageId}`,
      channelId: baseSource.channelId,
      messageId,
      title: null,
      content: 'A'.repeat(TRUNCATION_LIMIT) + '_TAIL_UNIQUE_',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
      ...overrides,
    };
  }

  it('a) does not render toggle for short message (< TRUNCATION_LIMIT chars)', () => {
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([
        {
          ...makeLongMsg(1),
          content: 'A short message well under the limit.',
        },
      ]),
    );
    renderWithClient(<CryptoNewsPage />);

    expect(
      screen.queryByRole('button', { name: /show more/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/show more/i)).not.toBeInTheDocument();
  });

  it('b) long message: collapsed hides text past TRUNCATION_LIMIT, expand reveals it, collapse hides again', () => {
    mockedUseMessages.mockReturnValue(makeMessagesQuery([makeLongMsg(2)]));
    const { container } = renderWithClient(<CryptoNewsPage />);

    expect(container.textContent).not.toContain('_TAIL_UNIQUE_');

    const toggle = screen.getByRole('button', { name: /show more/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(
      screen.getByRole('button', { name: /show less/i }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain('_TAIL_UNIQUE_');

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(
      screen.queryByRole('button', { name: /show less/i }),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('_TAIL_UNIQUE_');
  });

  it('c) boundary TRUNCATION_LIMIT (500 chars) has NO button; TRUNCATION_LIMIT+1 (501) HAS a button', () => {
    const at500 = {
      ...makeLongMsg(10),
      content: 'B'.repeat(TRUNCATION_LIMIT),
    };
    const at501 = {
      ...makeLongMsg(11),
      content: 'C'.repeat(TRUNCATION_LIMIT + 1),
    };
    mockedUseMessages.mockReturnValue(makeMessagesQuery([at500, at501]));
    const { rerender } = renderWithClient(<CryptoNewsPage />);

    const toggles = screen.queryAllByRole('button', { name: /show more/i });
    expect(toggles).toHaveLength(1);

    mockedUseMessages.mockReturnValue(makeMessagesQuery([at500]));
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CryptoNewsPage />
      </QueryClientProvider>,
    );
    expect(
      screen.queryByRole('button', { name: /show more/i }),
    ).not.toBeInTheDocument();
  });

  it('d) empty content (0 chars): renders without crash and without toggle', () => {
    const empty: CryptoNewsMessage = {
      ...makeLongMsg(20),
      content: '',
    };
    mockedUseMessages.mockReturnValue(makeMessagesQuery([empty]));

    expect(() => renderWithClient(<CryptoNewsPage />)).not.toThrow();
    expect(
      screen.queryByRole('button', { name: /show more/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('e) accordion: expanding B while A is expanded collapses A', () => {
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([makeLongMsg(30), makeLongMsg(31)]),
    );
    renderWithClient(<CryptoNewsPage />);

    const articles = screen.getAllByRole('article');
    const toggleA = within(articles[0]!).getByRole('button', {
      name: /show more/i,
    });
    const toggleB = within(articles[1]!).getByRole('button', {
      name: /show more/i,
    });

    fireEvent.click(toggleA);
    expect(
      within(articles[0]!).getByRole('button', { name: /show less/i }),
    ).toBeInTheDocument();

    fireEvent.click(toggleB);

    expect(
      within(articles[0]!).getByRole('button', { name: /show more/i }),
    ).toBeInTheDocument();
    expect(
      within(articles[0]!).queryByRole('button', { name: /show less/i }),
    ).not.toBeInTheDocument();

    expect(
      within(articles[1]!).getByRole('button', { name: /show less/i }),
    ).toBeInTheDocument();

    const showLessButtons = screen.queryAllByRole('button', {
      name: /show less/i,
    });
    expect(showLessButtons).toHaveLength(1);
  });

  it('f) reset on search: changing search input collapses any expanded message', () => {
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([makeLongMsg(40), makeLongMsg(41)]),
    );
    renderWithClient(<CryptoNewsPage />);

    const articles = screen.getAllByRole('article');
    fireEvent.click(
      within(articles[0]!).getByRole('button', { name: /show more/i }),
    );
    expect(
      within(articles[0]!).getByRole('button', { name: /show less/i }),
    ).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/search messages/i);
    fireEvent.change(input, { target: { value: 'bitcoin' } });

    expect(
      screen.queryByRole('button', { name: /show less/i }),
    ).not.toBeInTheDocument();
  });

  it('g) reset on channelFilter: changing the source select collapses any expanded message', () => {
    mockedUseMessages.mockReturnValue(
      makeMessagesQuery([makeLongMsg(50), makeLongMsg(51)]),
    );
    renderWithClient(<CryptoNewsPage />);

    const articles = screen.getAllByRole('article');
    fireEvent.click(
      within(articles[0]!).getByRole('button', { name: /show more/i }),
    );
    expect(
      screen.queryAllByRole('button', { name: /show less/i }),
    ).toHaveLength(1);

    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: baseSource.channelId } });

    expect(
      screen.queryByRole('button', { name: /show less/i }),
    ).not.toBeInTheDocument();
  });

  it('h) reset on pagination: paginating to next page collapses the expanded message', () => {
    const msgs = Array.from({ length: 11 }, (_, i) => makeLongMsg(60 + i));
    mockedUseMessages.mockReturnValue(makeMessagesQuery(msgs));
    renderWithClient(<CryptoNewsPage />);

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(10);
    fireEvent.click(
      within(articles[0]!).getByRole('button', { name: /show more/i }),
    );
    expect(
      within(articles[0]!).getByRole('button', { name: /show less/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const page2Articles = screen.getAllByRole('article');
    expect(page2Articles).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /show less/i }),
    ).not.toBeInTheDocument();
  });

  it('i) accessibility: toggle has aria-expanded=false collapsed, true when expanded', () => {
    mockedUseMessages.mockReturnValue(makeMessagesQuery([makeLongMsg(70)]));
    renderWithClient(<CryptoNewsPage />);

    const toggle = screen.getByRole('button', { name: /show more/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    const expanded = screen.getByRole('button', { name: /show less/i });
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
  });

  it('j) formattingEntities: [] on a 600-char message renders and button is present', () => {
    const msg: CryptoNewsMessage = {
      ...makeLongMsg(80),
      content: 'E'.repeat(600),
      formattingEntities: [],
    };
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msg]));
    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    expect(
      within(article).getByRole('button', { name: /show more/i }),
    ).toBeInTheDocument();
    expect(within(article).getByText(/E+/)).toBeInTheDocument();
  });

  it('k) formattingEntities: undefined on a 600-char message renders and button is present', () => {
    const msg: CryptoNewsMessage = {
      ...makeLongMsg(81),
      content: 'F'.repeat(600),
      formattingEntities: undefined,
    };
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msg]));
    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    expect(
      within(article).getByRole('button', { name: /show more/i }),
    ).toBeInTheDocument();
    expect(within(article).getByText(/F+/)).toBeInTheDocument();
  });
});

describe('CryptoNewsPage — 48h window (Todo 2: crypto-news-48h-window-media-retention)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  it('renders the KPI label "Messages (last 48h)" instead of the legacy "50 most recent"', () => {
    mockedUseMessages.mockReturnValue(makeMessagesQuery([]));

    renderWithClient(<CryptoNewsPage />);

    expect(screen.getByText('Messages (last 48h)')).toBeInTheDocument();
    expect(screen.queryByText(/50 most recent/i)).not.toBeInTheDocument();
  });

  it('requests useCryptoNewsMessages with limit 500 so the full 48h window fits', () => {
    mockedUseMessages.mockReturnValue(makeMessagesQuery([]));

    renderWithClient(<CryptoNewsPage />);

    expect(mockedUseMessages).toHaveBeenCalledWith(500);
  });
});
