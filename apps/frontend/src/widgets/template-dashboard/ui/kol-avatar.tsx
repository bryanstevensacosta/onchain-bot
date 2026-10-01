import { useState } from 'react';
import { avatarSrcFor, TEMPLATE_AVATAR_PLACEHOLDER } from '@/entities/template';

interface KolAvatarProps {
  readonly channelId: string;
  readonly avatarUrl: string | null;
  readonly handle: string | null;
  readonly size?: number;
}

export function KolAvatar({
  channelId,
  avatarUrl,
  handle,
  size = 32,
}: KolAvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = handle ?? channelId.slice(0, 2).toUpperCase();
  if (
    failed ||
    avatarSrcFor(avatarUrl, channelId) === TEMPLATE_AVATAR_PLACEHOLDER
  ) {
    return (
      <span
        data-testid={`avatar-placeholder-${channelId}`}
        aria-label={handle ?? channelId}
        className="inline-flex items-center justify-center rounded-full bg-slate-700 text-slate-200 font-bold"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      data-testid={`avatar-img-${channelId}`}
      src={avatarSrcFor(avatarUrl, channelId)}
      alt={handle ?? channelId}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
