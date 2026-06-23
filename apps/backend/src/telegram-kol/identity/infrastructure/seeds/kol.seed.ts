/**
 * Static seed list of Telegram KOL peer ids to register on application bootstrap.
 *
 * The display title and handle are resolved at boot time via the
 * Telegram MTProto adapter (TelegramListenerPort.resolveChannelMetadata),
 * so this list only needs the peer ids.
 *
 * Override at runtime via the INGESTION_TELEGRAM_SEED_CHANNELS env var
 * (format: "kolId[,kolId...]"). An entry of "kolId|handle|title"
 * also works and skips the metadata lookup for that KOL.
 *
 * Disable entirely with INGESTION_TELEGRAM_SEED_ENABLED=false (default).
 */
export interface SeedKol {
  readonly kolId: string;
  readonly handle?: string;
  readonly title?: string;
}

export const KOL_SEED: ReadonlyArray<SeedKol> = [
  { kolId: '2397610468' },
  { kolId: '1553109986' },
  { kolId: '1300818502' },
  { kolId: '1960616143' },
  { kolId: '2099286836' },
  { kolId: '1758611100' },
  { kolId: '2088887132' },
  { kolId: '2388486828' },
  { kolId: '1756488143' },
  { kolId: '1867934972' },
  { kolId: '1732891794' },
  { kolId: '2260455569' },
  { kolId: '1883929251' },
  { kolId: '1654895559' },
  { kolId: '1730427571' },
  { kolId: '1794471884' },
  { kolId: '1697697574' },
  { kolId: '1937478270' },
  { kolId: '1763265784' },
  { kolId: '1584420389' },
  { kolId: '1671461751' },
  { kolId: '1824357363' },
  { kolId: '1613001878' },
  { kolId: '1992057930' },
  { kolId: '1662041785' },
  { kolId: '1413058397' },
  { kolId: '1832386664' },
  { kolId: '1225991487' },
  { kolId: '1783469467' },
  { kolId: '1877172822' },
  { kolId: '1696188050' },
  { kolId: '2086003521' },
  { kolId: '1810124798' },
  { kolId: '2385226263' },
  { kolId: '1975392115' },
  { kolId: '2054466090' },
  { kolId: '1874732560' },
  { kolId: '1880851888' },
  { kolId: '1819368322' },
  { kolId: '1667198684' },
  { kolId: '1500214409' },
  { kolId: '1572093129' },
  { kolId: '1523523939' },
  { kolId: '1718703340' },
  { kolId: '1924457034' },
];
