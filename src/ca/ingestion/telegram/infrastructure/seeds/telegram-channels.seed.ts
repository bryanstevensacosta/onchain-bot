/**
 * Static seed list of Telegram channel peer ids to register on application bootstrap.
 *
 * The display title and username are resolved at boot time via the
 * Telegram MTProto adapter (TelegramListenerPort.resolveChannelMetadata),
 * so this list only needs the peer ids.
 *
 * Override at runtime via the INGESTION_TELEGRAM_SEED_CHANNELS env var
 * (format: "channelId[,channelId...]"). An entry of "channelId|username|title"
 * also works and skips the metadata lookup for that channel.
 *
 * Disable entirely with INGESTION_TELEGRAM_SEED_ENABLED=false (default).
 */
export interface SeedChannel {
  readonly channelId: string;
  readonly username?: string;
  readonly title?: string;
}

export const TELEGRAM_CHANNEL_SEED: ReadonlyArray<SeedChannel> = [
  { channelId: '2397610468' },
  { channelId: '1553109986' },
  { channelId: '1300818502' },
  { channelId: '1960616143' },
  { channelId: '2099286836' },
  { channelId: '1758611100' },
  { channelId: '2088887132' },
  { channelId: '2388486828' },
  { channelId: '1756488143' },
  { channelId: '1867934972' },
  { channelId: '1732891794' },
  { channelId: '2260455569' },
  { channelId: '1883929251' },
  { channelId: '1654895559' },
  { channelId: '1730427571' },
  { channelId: '1794471884' },
  { channelId: '1697697574' },
  { channelId: '1937478270' },
  { channelId: '1763265784' },
  { channelId: '1584420389' },
  { channelId: '1671461751' },
  { channelId: '1824357363' },
  { channelId: '1613001878' },
  { channelId: '1992057930' },
  { channelId: '1662041785' },
  { channelId: '1413058397' },
  { channelId: '1832386664' },
  { channelId: '1225991487' },
  { channelId: '1783469467' },
  { channelId: '1877172822' },
  { channelId: '1696188050' },
  { channelId: '2086003521' },
  { channelId: '1810124798' },
  { channelId: '2385226263' },
  { channelId: '1975392115' },
  { channelId: '2054466090' },
  { channelId: '1874732560' },
  { channelId: '1880851888' },
  { channelId: '1819368322' },
  { channelId: '1667198684' },
  { channelId: '1500214409' },
  { channelId: '1572093129' },
  { channelId: '1523523939' },
  { channelId: '1718703340' },
  { channelId: '1924457034' },
];
