import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Button, Card } from '@/shared/ui';
import { Modal } from '@/shared/ui/modal';
import {
  useAds,
  useClearAdImage,
  useCreateAd,
  useDeleteAd,
  useMediaLibrary,
  usePublishAdNow,
  useReuseLibraryImage,
  useReuseLibraryImages,
  useUpdateAd,
  useUploadAdImage,
  useUploadAdVideo,
} from '@/features/crypto-news-ads/model/use-ads';
import {
  adImageUrl,
  adVideoUrl,
  libraryImageUrl,
  type AdFormat,
  type AdView,
} from '@/features/crypto-news-ads/api/ads-api';
import { AdHtmlPreview } from './ad-html-preview';

/**
 * Modal submit payload: unlike `CreateAdBody`, `expiresAt` is ALWAYS present
 * (`null` = explicit CLEAR, Metis R6.1). `handleCreateSubmit` maps `null` →
 * omitted for the create API; edit passes it through to `UpdateAdBody`.
 * `format` is the target format: the handlers create/update WITHOUT format
 * (backend `Ad.create()` defaults to `text` and `validateInvariants()` rejects
 * a format patch with no media), then run the media mutation, then PATCH
 * `{ format }` once the media exists.
 */
export interface AdModalSubmitBody {
  name: string;
  body: string;
  format: AdFormat;
  expiresAt: string | null;
  expirationAction: 'disable' | 'delete';
  image?:
    | { kind: 'upload'; file: File }
    | { kind: 'reuse'; libraryMediaId: string };
  /** Staged video file for the `video` format (uploaded after create/update). */
  video?: { kind: 'upload'; file: File };
  /** Library media ids for the `album` format (reused after create/update). */
  albumMediaIds?: string[];
}

const FORMAT_OPTIONS: ReadonlyArray<{ value: AdFormat; label: string }> = [
  { value: 'text', label: '🅣 Texto' },
  { value: 'photo', label: '🖼 Foto' },
  { value: 'video', label: '🎬 Video' },
  { value: 'album', label: '🗂 Álbum' },
];

const FORMAT_BADGES: Record<
  AdFormat,
  { icon: string; label: string; badgeClass: string }
> = {
  text: {
    icon: '🅣',
    label: 'Texto',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  photo: {
    icon: '🖼',
    label: 'Foto',
    badgeClass: 'bg-blue-900/40 text-blue-300 border-blue-900/60',
  },
  video: {
    icon: '🎬',
    label: 'Video',
    badgeClass: 'bg-purple-900/40 text-purple-300 border-purple-900/60',
  },
  album: {
    icon: '🗂',
    label: 'Álbum',
    badgeClass: 'bg-emerald-900/40 text-emerald-300 border-emerald-900/60',
  },
};

const TOOLBAR_BUTTONS: ReadonlyArray<{
  label: string;
  title: string;
  open: string;
  close: string;
}> = [
  { label: 'B', title: 'Bold', open: '<b>', close: '</b>' },
  { label: 'I', title: 'Italic', open: '<i>', close: '</i>' },
  { label: 'U', title: 'Underline', open: '<u>', close: '</u>' },
  { label: 'S', title: 'Strikethrough', open: '<s>', close: '</s>' },
  {
    label: 'Spoiler',
    title: 'Spoiler',
    open: '<tg-spoiler>',
    close: '</tg-spoiler>',
  },
  { label: 'Code', title: 'Inline code', open: '<code>', close: '</code>' },
  { label: 'Pre', title: 'Preformatted block', open: '<pre>', close: '</pre>' },
  {
    label: 'Quote',
    title: 'Blockquote',
    open: '<blockquote>',
    close: '</blockquote>',
  },
];

const MAX_ALBUM_IMAGES = 10;

interface AdModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialName: string;
  initialBody: string;
  initialFormat: AdFormat;
  initialExpiresAt: string | null;
  initialExpirationAction: 'disable' | 'delete';
  initialImageMediaId: string | null;
  initialVideoMediaId: string | null;
  initialAlbumMediaIds: string[] | null;
  onSubmit: (body: AdModalSubmitBody) => void;
  pending: boolean;
  errorMessage: string | null;
  pendingLabel?: string;
}

function AdModal({
  isOpen,
  onClose,
  title,
  initialName,
  initialBody,
  initialFormat,
  initialExpiresAt,
  initialExpirationAction,
  initialImageMediaId,
  initialVideoMediaId,
  initialAlbumMediaIds,
  onSubmit,
  pending,
  errorMessage,
  pendingLabel = 'Saving…',
}: AdModalProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialBody);
  const [format, setFormat] = useState<AdFormat>(initialFormat);
  const [expiresAt, setExpiresAt] = useState(
    initialExpiresAt ? isoToLocalInput(initialExpiresAt) : '',
  );
  const [expirationAction, setExpirationAction] = useState<
    'disable' | 'delete'
  >(initialExpirationAction);
  const [pendingImage, setPendingImage] = useState<
    | { kind: 'upload'; file: File }
    | { kind: 'reuse'; libraryMediaId: string }
    | null
  >(null);
  const [pendingVideo, setPendingVideo] = useState<{
    kind: 'upload';
    file: File;
  } | null>(null);
  const [albumSelection, setAlbumSelection] = useState<string[]>([]);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const libraryQuery = useMediaLibrary();

  // Once an ad has media, its format is fixed (backend invariant:
  // `Ad.validateInvariants()`). Editing such an ad locks the selector.
  const formatLocked =
    initialImageMediaId !== null ||
    initialVideoMediaId !== null ||
    (initialAlbumMediaIds ?? []).length > 0;

  // Reset form state when the modal opens so edits reflect the selected
  // ad instead of stale values from a previous mount.
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setBody(initialBody);
      setFormat(initialFormat);
      setExpiresAt(initialExpiresAt ? isoToLocalInput(initialExpiresAt) : '');
      setExpirationAction(initialExpirationAction);
      setPendingImage(null);
      setPendingVideo(null);
      setAlbumSelection([]);
      setPickerOpen(false);
    }
  }, [
    isOpen,
    initialName,
    initialBody,
    initialFormat,
    initialExpiresAt,
    initialExpirationAction,
    initialImageMediaId,
    initialVideoMediaId,
    initialAlbumMediaIds,
  ]);

  // Object URL for the staged video (revoked when it changes/unmounts).
  useEffect(() => {
    if (pendingVideo?.kind !== 'upload') {
      setVideoPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(pendingVideo.file);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingVideo]);

  const formatReady =
    format === 'text' ||
    (format === 'photo' &&
      (initialImageMediaId !== null || pendingImage !== null)) ||
    (format === 'video' &&
      (initialVideoMediaId !== null || pendingVideo !== null)) ||
    (format === 'album' &&
      ((initialAlbumMediaIds ?? []).length > 0 || albumSelection.length > 0));

  const canSubmit =
    name.trim().length > 0 && body.trim().length > 0 && !pending && formatReady;

  function handleClose() {
    if (pending) return;
    onClose();
  }

  function handleFormatChange(next: AdFormat) {
    if (formatLocked || next === format) return;
    setFormat(next);
    // Media stages are format-specific — clear them on switch.
    setPendingImage(null);
    setPendingVideo(null);
    setAlbumSelection([]);
    setPickerOpen(false);
  }

  function wrapSelection(open: string, close: string) {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.slice(start, end);
    const replacement = `${open}${selected}${close}`;
    setBody(`${body.slice(0, start)}${replacement}${body.slice(end)}`);
    // Restore the selection around the wrapped text after the re-render.
    requestAnimationFrame(() => {
      textarea.selectionStart = start + open.length;
      textarea.selectionEnd = start + open.length + selected.length;
      textarea.focus();
    });
  }

  function handleLinkTool() {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.slice(start, end);
    const url = window.prompt('Link URL', 'https://');
    if (url === null) return;
    const trimmedUrl = url.trim();
    if (trimmedUrl === '') return;
    const replacement = `<a href="${trimmedUrl}">${selected || trimmedUrl}</a>`;
    setBody(`${body.slice(0, start)}${replacement}${body.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.selectionStart = start;
      textarea.selectionEnd = start + replacement.length;
      textarea.focus();
    });
  }

  function toggleAlbumSelection(libraryMediaId: string) {
    setAlbumSelection((sel) => {
      if (sel.includes(libraryMediaId)) {
        return sel.filter((id) => id !== libraryMediaId);
      }
      if (sel.length >= MAX_ALBUM_IMAGES) return sel;
      return [...sel, libraryMediaId];
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const expiresAtIso = localInputToIso(expiresAt);
    onSubmit({
      name: name.trim(),
      body: body.trim(),
      format,
      // Always include expiresAt: null = explicit CLEAR (Metis R6.1);
      // omitting it would silently keep the old expiry on edit.
      expiresAt: expiresAtIso,
      expirationAction,
      ...(pendingImage !== null ? { image: pendingImage } : {}),
      ...(pendingVideo !== null ? { video: pendingVideo } : {}),
      ...(format === 'album' && albumSelection.length > 0
        ? { albumMediaIds: [...albumSelection] }
        : {}),
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingImage({ kind: 'upload', file });
  }

  function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingVideo({ kind: 'upload', file });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <span className="block text-xs uppercase text-slate-500 mb-1">
            Format
          </span>
          <div className="flex flex-wrap gap-1">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleFormatChange(opt.value)}
                disabled={pending || formatLocked}
                aria-pressed={format === opt.value}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  format === opt.value
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {formatLocked && (
            <p className="text-xs text-slate-500 mt-1">
              Formato bloqueado: el ad ya tiene media.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="ad-name"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="ad-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pump alpha banner"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={pending}
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="ad-body"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Body <span className="text-red-400">*</span>
          </label>
          {/* Formatting toolbar renders for all formats: the body is published
              as the Telegram caption with parse_mode HTML (sendPhoto/sendVideo/
              sendMediaGroup in bot-api-crypto-news-publisher.adapter.ts). Note
              media captions truncate to 1024 chars (CAPTION_MAX_LENGTH) vs 4096
              for text-only messages. */}
          <div className="flex flex-wrap gap-1 mb-1.5">
            {TOOLBAR_BUTTONS.map((btn) => (
              <button
                key={btn.label}
                type="button"
                title={btn.title}
                onClick={() => wrapSelection(btn.open, btn.close)}
                disabled={pending}
                className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs leading-none"
              >
                {btn.label}
              </button>
            ))}
            <button
              type="button"
              title="Link"
              onClick={handleLinkTool}
              disabled={pending}
              className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs leading-none"
            >
              Link
            </button>
          </div>
          <textarea
            ref={bodyRef}
            id="ad-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ad copy sent to the output channel"
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={pending}
          />
        </div>

        <div>
          <span className="block text-xs uppercase text-slate-500 mb-1">
            Preview
          </span>
          <div
            aria-label="Ad preview"
            className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 min-h-[2.5rem]"
          >
            <AdHtmlPreview body={body} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="ad-expires-at"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Expires at
            </label>
            <input
              id="ad-expires-at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              disabled={pending}
            />
          </div>
          <div>
            <label
              htmlFor="ad-expiration-action"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              On expiry
            </label>
            <select
              id="ad-expiration-action"
              value={expirationAction}
              onChange={(e) =>
                setExpirationAction(e.target.value as 'disable' | 'delete')
              }
              disabled={pending}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="disable">Disable</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        </div>

        {format === 'photo' && (
          <div>
            <span className="block text-xs uppercase text-slate-500 mb-1">
              Image
            </span>
            <div className="flex flex-col gap-2">
              {initialImageMediaId !== null && pendingImage === null && (
                <img
                  src={adImageUrl(initialImageMediaId)}
                  alt="Current ad image"
                  aria-label="Current ad image"
                  className="h-12 w-12 rounded object-cover border border-slate-700"
                />
              )}
              {pendingImage?.kind === 'upload' && (
                <span className="text-xs text-slate-300">
                  {pendingImage.file.name}
                </span>
              )}
              {pendingImage?.kind === 'reuse' && (
                <img
                  src={libraryImageUrl(pendingImage.libraryMediaId)}
                  alt="Selected library image"
                  className="h-12 w-12 rounded object-cover border border-slate-700"
                />
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="Ad image file"
                  data-testid="ad-image-file-input"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={pending}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                >
                  Upload image
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPickerOpen((open) => !open)}
                  aria-label="Toggle library picker"
                  disabled={pending}
                >
                  {pickerOpen ? 'Hide library' : 'Pick from library'}
                </Button>
              </div>
              {pickerOpen && (
                <div className="mt-1">
                  {libraryQuery.isLoading ? (
                    <div className="text-sm text-slate-500">Loading...</div>
                  ) : libraryQuery.error ? (
                    <div className="text-sm text-red-400">
                      {libraryQuery.error instanceof Error
                        ? libraryQuery.error.message
                        : String(libraryQuery.error)}
                    </div>
                  ) : (libraryQuery.data ?? []).length === 0 ? (
                    <div className="text-sm text-slate-500">
                      Library is empty — upload an image first.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {(libraryQuery.data ?? []).map((lib) => (
                        <img
                          key={lib.id}
                          src={libraryImageUrl(lib.id)}
                          alt={lib.originalFileName ?? lib.id}
                          title={lib.originalFileName ?? lib.id}
                          className="h-12 w-12 rounded object-cover border border-slate-700 cursor-pointer hover:border-blue-500"
                          onClick={() =>
                            setPendingImage({
                              kind: 'reuse',
                              libraryMediaId: lib.id,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {format === 'video' && (
          <div>
            <span className="block text-xs uppercase text-slate-500 mb-1">
              Video <span className="text-red-400">*</span>
            </span>
            <div className="flex flex-col gap-2">
              {initialVideoMediaId !== null && pendingVideo === null && (
                <video
                  src={adVideoUrl(initialVideoMediaId)}
                  controls
                  aria-label="Current ad video"
                  className="h-24 w-40 rounded border border-slate-700 bg-black"
                />
              )}
              {pendingVideo !== null && videoPreviewUrl !== null && (
                <video
                  src={videoPreviewUrl}
                  controls
                  aria-label="Ad video preview"
                  className="h-24 w-40 rounded border border-slate-700 bg-black"
                />
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4"
                aria-label="Ad video file"
                data-testid="ad-video-file-input"
                className="hidden"
                onChange={handleVideoChange}
                disabled={pending}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={pending}
                >
                  Upload video
                </Button>
                {pendingVideo !== null && (
                  <span className="text-xs text-slate-300">
                    {pendingVideo.file.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {format === 'album' && (
          <div>
            <span className="block text-xs uppercase text-slate-500 mb-1">
              Album images <span className="text-red-400">*</span>
            </span>
            <div className="flex flex-col gap-2">
              {libraryQuery.isLoading ? (
                <div className="text-sm text-slate-500">Loading...</div>
              ) : libraryQuery.error ? (
                <div className="text-sm text-red-400">
                  {libraryQuery.error instanceof Error
                    ? libraryQuery.error.message
                    : String(libraryQuery.error)}
                </div>
              ) : (libraryQuery.data ?? []).length === 0 ? (
                <div className="text-sm text-slate-500">
                  Library is empty — upload an image first.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {(libraryQuery.data ?? []).map((lib) => {
                      const selected = albumSelection.includes(lib.id);
                      return (
                        <label
                          key={lib.id}
                          className={`flex flex-col items-center gap-1 cursor-pointer border rounded p-1 transition-colors ${
                            selected
                              ? 'border-blue-500 bg-blue-900/20'
                              : 'border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleAlbumSelection(lib.id)}
                            aria-label={`Select ${lib.originalFileName ?? lib.id} for album`}
                            className="sr-only"
                          />
                          <img
                            src={libraryImageUrl(lib.id)}
                            alt={lib.originalFileName ?? lib.id}
                            className="h-12 w-12 rounded object-cover"
                          />
                          <span className="text-[10px] text-slate-500 max-w-16 truncate">
                            {lib.originalFileName ?? lib.id}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <span className="text-xs text-slate-400">
                    {albumSelection.length}/{MAX_ALBUM_IMAGES} selected
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
          >
            {pending ? pendingLabel : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function formatLastPublished(lastPublishedAt: string | null): string {
  if (!lastPublishedAt) return 'never';
  return new Date(lastPublishedAt).toLocaleString();
}

/**
 * "Expires in" label rendered from an absolute ISO timestamp at render
 * time (no ticking interval — freshness comes from the useAds poll).
 * Rounding is floor-based per the pinned UI spec (Metis F5.4):
 *   null            -> "no limit"
 *   expiresAt <= now -> "expired"
 *   > 24h           -> "in Xd Yh"
 *   > 1h            -> "in Xh Ym"
 *   else            -> "in Xm"
 */
export function formatExpiresIn(expiresAt: string | null, now: Date): string {
  if (expiresAt === null) return 'no limit';
  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  if (diffMs <= 0) return 'expired';
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (diffMs > DAY) {
    return `in ${Math.floor(diffMs / DAY)}d ${Math.floor((diffMs % DAY) / HOUR)}h`;
  }
  if (diffMs > HOUR) {
    return `in ${Math.floor(diffMs / HOUR)}h ${Math.floor((diffMs % HOUR) / MINUTE)}m`;
  }
  return `in ${Math.floor(diffMs / MINUTE)}m`;
}

/** ISO (UTC) -> local `YYYY-MM-DDTHH:mm` for the datetime-local input. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local `YYYY-MM-DDTHH:mm` (or '') -> ISO UTC with seconds trimmed; '' -> null. */
export function localInputToIso(local: string): string | null {
  const trimmed = local.trim();
  if (trimmed === '') return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

interface AdImageCellProps {
  item: AdView;
  disabled?: boolean;
  externalError?: string | null;
}

function AdImageCell({
  item,
  disabled = false,
  externalError = null,
}: AdImageCellProps): React.ReactElement {
  const uploadMut = useUploadAdImage();
  const clearMut = useClearAdImage();
  const libraryQuery = useMediaLibrary();
  const reuseMut = useReuseLibraryImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reuseOpen, setReuseOpen] = useState(false);

  const errorMessage =
    uploadMut.error?.message ??
    clearMut.error?.message ??
    (reuseMut.error instanceof Error ? reuseMut.error.message : null) ??
    externalError ??
    null;

  // Close the picker once a reuse succeeds (the hook invalidates the
  // affected queries). `isSuccess` stays true across re-opens, so the
  // effect only re-fires when a fresh reuse completes.
  useEffect(() => {
    if (reuseMut.isSuccess) {
      setReuseOpen(false);
    }
  }, [reuseMut.isSuccess]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadMut.mutate({ adId: item.id, file });
  }

  function handleRemove() {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Remove image for ad "${item.name}"?`);
      if (!ok) return;
    }
    clearMut.mutate(item.id);
  }

  const libraryItems = libraryQuery.data ?? [];

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="inline-flex items-center gap-2">
        {item.imageMediaId !== null && (
          <>
            <img
              src={adImageUrl(item.imageMediaId)}
              alt={`${item.name} image`}
              className="h-8 w-8 rounded object-cover border border-slate-700"
            />
            <Button
              variant="danger"
              size="sm"
              onClick={handleRemove}
              disabled={disabled || clearMut.isPending}
            >
              Remove
            </Button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploadMut.isPending}
        >
          Upload image
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setReuseOpen(true)}
          disabled={disabled}
        >
          Reuse
        </Button>
      </div>
      {errorMessage && (
        <span role="alert" className="text-xs text-red-400">
          {errorMessage}
        </span>
      )}

      <Modal
        isOpen={reuseOpen}
        onClose={() => setReuseOpen(false)}
        title="Reuse existing image"
        size="lg"
      >
        {libraryQuery.isLoading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : libraryQuery.error ? (
          <div className="text-sm text-red-400">
            {libraryQuery.error instanceof Error
              ? libraryQuery.error.message
              : String(libraryQuery.error)}
          </div>
        ) : libraryItems.length === 0 ? (
          <div className="text-sm text-slate-500">
            Library is empty — upload an image first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {libraryItems.map((lib) => (
              <div
                key={lib.id}
                className="flex flex-col items-center gap-1"
                title={lib.originalFileName ?? lib.id}
              >
                <img
                  src={libraryImageUrl(lib.id)}
                  alt={lib.originalFileName ?? lib.id}
                  className="h-16 w-16 rounded object-cover border border-slate-700 cursor-pointer hover:border-blue-500"
                  onClick={() =>
                    reuseMut.mutate({
                      adId: item.id,
                      libraryMediaId: lib.id,
                    })
                  }
                />
                <span className="text-[10px] text-slate-500 max-w-16 truncate">
                  {lib.originalFileName ?? lib.id}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AdsManager(): React.ReactElement {
  const { data, isLoading, error } = useAds();
  const createMut = useCreateAd();
  const updateMut = useUpdateAd();
  const deleteMut = useDeleteAd();
  const uploadMut = useUploadAdImage();
  const reuseMut = useReuseLibraryImage();
  const uploadVideoMut = useUploadAdVideo();
  const reuseImagesMut = useReuseLibraryImages();
  const publishNowMut = usePublishAdNow();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdView | null>(null);
  const [lastImageError, setLastImageError] = useState<{
    adId: string;
    message: string;
  } | null>(null);

  const ads = (data ?? [])
    .slice()
    .sort(
      (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
    );

  const modalPending =
    createMut.isPending ||
    updateMut.isPending ||
    uploadMut.isPending ||
    reuseMut.isPending ||
    uploadVideoMut.isPending ||
    reuseImagesMut.isPending;

  const modalPendingLabel = createMut.isPending
    ? 'Creating…'
    : updateMut.isPending
      ? 'Updating…'
      : uploadMut.isPending || reuseMut.isPending
        ? 'Uploading image…'
        : uploadVideoMut.isPending
          ? 'Uploading video…'
          : reuseImagesMut.isPending
            ? 'Setting album…'
            : 'Saving…';

  function handleOpenEdit(item: AdView) {
    setEditingItem(item);
    setEditModalOpen(true);
  }

  function closeModalUi() {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingItem(null);
  }

  function handleCloseModals() {
    closeModalUi();
    setLastImageError(null);
  }

  function handleCreateSubmit(body: AdModalSubmitBody) {
    const { image, video, albumMediaIds, format, ...metadata } = body;
    createMut.mutate(
      {
        name: metadata.name,
        body: metadata.body,
        ...(metadata.expiresAt !== null
          ? { expiresAt: metadata.expiresAt }
          : {}),
        expirationAction: metadata.expirationAction,
      },
      {
        onSuccess: (created: AdView) => {
          const onMediaError = (err: Error) => {
            setLastImageError({ adId: created.id, message: err.message });
            closeModalUi();
          };
          // Media must exist before the format patch (backend invariant),
          // so: create (text) → media mutation → PATCH `{ format }`.
          const finish = () => {
            if (format === 'text') {
              handleCloseModals();
              return;
            }
            updateMut.mutate(
              { id: created.id, patch: { format } },
              { onSuccess: () => handleCloseModals() },
            );
          };
          if (image) {
            if (image.kind === 'upload') {
              uploadMut.mutate(
                { adId: created.id, file: image.file },
                { onSuccess: () => finish(), onError: onMediaError },
              );
            } else {
              reuseMut.mutate(
                { adId: created.id, libraryMediaId: image.libraryMediaId },
                { onSuccess: () => finish(), onError: onMediaError },
              );
            }
          } else if (video) {
            uploadVideoMut.mutate(
              { adId: created.id, file: video.file },
              { onSuccess: () => finish(), onError: onMediaError },
            );
          } else if (albumMediaIds && albumMediaIds.length > 0) {
            reuseImagesMut.mutate(
              { adId: created.id, libraryMediaIds: albumMediaIds },
              { onSuccess: () => finish(), onError: onMediaError },
            );
          } else {
            finish();
          }
        },
      },
    );
  }

  function handleEditSubmit(body: AdModalSubmitBody) {
    if (!editingItem) return;
    const { image, video, albumMediaIds, format, ...metadata } = body;
    const editingAdId = editingItem.id;
    const currentFormat = editingItem.format;
    updateMut.mutate(
      { id: editingAdId, patch: metadata },
      {
        onSuccess: () => {
          const onMediaError = (err: Error) => {
            setLastImageError({ adId: editingAdId, message: err.message });
            closeModalUi();
          };
          // First patch carries NO format (backend rejects format with no
          // media). Media changes run after, then a second patch flips the
          // format only when it actually changed.
          const finish = () => {
            if (format === currentFormat || format === 'text') {
              handleCloseModals();
              return;
            }
            updateMut.mutate(
              { id: editingAdId, patch: { format } },
              { onSuccess: () => handleCloseModals() },
            );
          };
          if (image) {
            if (image.kind === 'upload') {
              uploadMut.mutate(
                { adId: editingAdId, file: image.file },
                { onSuccess: () => finish(), onError: onMediaError },
              );
            } else {
              reuseMut.mutate(
                { adId: editingAdId, libraryMediaId: image.libraryMediaId },
                { onSuccess: () => finish(), onError: onMediaError },
              );
            }
          } else if (video) {
            uploadVideoMut.mutate(
              { adId: editingAdId, file: video.file },
              { onSuccess: () => finish(), onError: onMediaError },
            );
          } else if (albumMediaIds && albumMediaIds.length > 0) {
            reuseImagesMut.mutate(
              { adId: editingAdId, libraryMediaIds: albumMediaIds },
              { onSuccess: () => finish(), onError: onMediaError },
            );
          } else {
            finish();
          }
        },
      },
    );
  }

  function handleToggle(item: AdView) {
    updateMut.mutate({ id: item.id, patch: { enabled: !item.enabled } });
  }

  function handleMove(item: AdView, dir: -1 | 1) {
    const index = ads.findIndex((a) => a.id === item.id);
    const target = ads[index + dir];
    if (!target) return;
    // Swap semantics: exchange order values with the adjacent ad so no
    // duplicate `order` values are ever produced (PATCHing order ± 1
    // collides with the neighbor's order).
    updateMut.mutate({ id: item.id, patch: { order: target.order } });
    updateMut.mutate({ id: target.id, patch: { order: item.order } });
  }

  function handleDelete(item: AdView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete ad "${item.name}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(item.id);
  }

  function handlePublishNow(item: AdView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Send ad "${item.name}" to Telegram now?`);
      if (!ok) return;
    }
    publishNowMut.mutate(item.id);
  }

  /**
   * Inline feedback for the manual "Send now" publish. `publishNowMut` is a
   * SINGLE shared mutation across all rows, so the success/error span must be
   * gated on `publishNowMut.variables === item.id` — otherwise every row would
   * show the last publish's outcome.
   */
  function renderPublishFeedback(item: AdView) {
    if (publishNowMut.variables !== item.id) return null;
    if (publishNowMut.isSuccess && publishNowMut.data?.ok) {
      return (
        <span className="text-xs text-green-400">
          Sent (msg {publishNowMut.data.messageId})
        </span>
      );
    }
    // 200-with-ok:false is NOT a thrown error — the http-client only throws on
    // non-2xx, so `data.ok` must be checked explicitly alongside `error`.
    const errorMessage =
      publishNowMut.error?.message ??
      (publishNowMut.data && !publishNowMut.data.ok
        ? publishNowMut.data.error
        : null);
    if (errorMessage) {
      return (
        <span role="alert" className="text-xs text-red-400">
          {errorMessage}
        </span>
      );
    }
    return null;
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Ads ({ads.length})
        </h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setCreateModalOpen(true)}
        >
          + Add Ad
        </Button>
      </div>

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add ad: {String(createMut.error)}
        </div>
      )}

      <AdModal
        isOpen={createModalOpen}
        onClose={handleCloseModals}
        title="Add Ad"
        initialName=""
        initialBody=""
        initialFormat="text"
        initialExpiresAt={null}
        initialExpirationAction="disable"
        initialImageMediaId={null}
        initialVideoMediaId={null}
        initialAlbumMediaIds={null}
        onSubmit={handleCreateSubmit}
        pending={modalPending}
        pendingLabel={modalPendingLabel}
        errorMessage={createMut.error?.message ?? null}
      />

      <AdModal
        isOpen={editModalOpen}
        onClose={handleCloseModals}
        title="Edit Ad"
        initialName={editingItem?.name ?? ''}
        initialBody={editingItem?.body ?? ''}
        initialFormat={editingItem?.format ?? 'text'}
        initialExpiresAt={editingItem?.expiresAt ?? null}
        initialExpirationAction={editingItem?.expirationAction ?? 'disable'}
        initialImageMediaId={editingItem?.imageMediaId ?? null}
        initialVideoMediaId={editingItem?.videoMediaId ?? null}
        initialAlbumMediaIds={editingItem?.albumMediaIds ?? null}
        onSubmit={handleEditSubmit}
        pending={modalPending}
        pendingLabel={modalPendingLabel}
        errorMessage={updateMut.error?.message ?? null}
      />

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          Failed to load ads: {String(error)}
        </div>
      ) : ads.length === 0 ? (
        <div className="text-sm text-slate-500">
          No ads yet. Add one above to start rotating sponsored content.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700">
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Format</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2 pr-3">Published</th>
                <th className="py-2 pr-3">Last published</th>
                <th className="py-2 pr-3">Expires</th>
                <th className="py-2 pr-3">Image</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-800/60 last:border-0"
                >
                  <td className="py-2 pr-3">
                    <div className="inline-flex items-center gap-1">
                      <span className="text-xs text-slate-500 w-4">
                        {item.order}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMove(item, -1)}
                        disabled={index === 0 || updateMut.isPending}
                        aria-label={`Move ${item.name} up`}
                        className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs leading-none"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(item, 1)}
                        disabled={
                          index === ads.length - 1 || updateMut.isPending
                        }
                        aria-label={`Move ${item.name} down`}
                        className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs leading-none"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-slate-200 max-w-[180px] truncate">
                    {item.name}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border font-medium ${FORMAT_BADGES[item.format].badgeClass}`}
                    >
                      <span aria-hidden="true">
                        {FORMAT_BADGES[item.format].icon}
                      </span>
                      {FORMAT_BADGES[item.format].label}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => handleToggle(item)}
                        disabled={updateMut.isPending}
                        aria-label={`Toggle ${item.name}`}
                      />
                    </label>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    {item.timesPublished}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">
                    {formatLastPublished(item.lastPublishedAt)}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {item.expiresAt !== null &&
                    new Date(item.expiresAt).getTime() <= Date.now() ? (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-medium">
                        expired
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        {formatExpiresIn(item.expiresAt, new Date())}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {item.format === 'photo' && (
                      <AdImageCell
                        item={item}
                        disabled={createModalOpen || editModalOpen}
                        externalError={
                          lastImageError !== null &&
                          item.id === lastImageError.adId
                            ? lastImageError.message
                            : null
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="inline-flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handlePublishNow(item)}
                          disabled={publishNowMut.isPending}
                        >
                          Send now
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEdit(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMut.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                      {renderPublishFeedback(item)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
