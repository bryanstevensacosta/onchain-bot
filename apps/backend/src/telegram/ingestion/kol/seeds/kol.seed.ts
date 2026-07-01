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
  /**
   * Telegram @username for direct channel join without requiring membership.
   * When provided, KolSeeder uses this to join the channel BEFORE attempting
   * numeric ID resolution. Use this for public channels where you know the
   * username but not the numeric ID (or the account isn't a member).
   *
   * Format: '@username' (with @ prefix).
   */
  readonly username?: string;
}

export const KOL_SEED: ReadonlyArray<SeedKol> = [
  { kolId: '2397610468', username: '@KOLscope' },
  { kolId: '1553109986', username: '@lookonchain' },
  { kolId: '1300818502', username: '@trades_johnny' },
  { kolId: '1960616143', title: 'SpyDefi' },
  { kolId: '2099286836', username: '@MajorTrending' },
  { kolId: '1758611100', username: '@mad_apes_gambles' },
  { kolId: '2088887132', username: '@sadcatgamble' },
  { kolId: '2388486828', username: '@BullishCallsPremium' },
  { kolId: '1756488143', username: '@lowtaxsolana' },
  { kolId: '1867934972', username: '@walloftrophies' },
  { kolId: '1732891794', username: '@GabbensCalls' },
  { kolId: '2260455569', username: '@PinguimGEMS' },
  { kolId: '1883929251', username: '@gogetagambles' },
  { kolId: '1654895559', username: '@BurpBoard' },
  { kolId: '1730427571', username: '@CallAnalyser' },
  { kolId: '1794471884', username: '@MineGems' },
  { kolId: '1697697574', username: '@mad_apes_call' },
  { kolId: '1937478270', username: '@ghastlygems' },
  { kolId: '1763265784', username: '@MarkDegens' },
  { kolId: '1584420389', username: '@MarkGems' },
  { kolId: '1671461751', username: '@CriptoGemas_Anuncios' },
  { kolId: '1824357363', username: '@ramcalls' },
  { kolId: '1613001878', username: '@buildermanlaunches' },
  { kolId: '1992057930', username: '@BasedDegenGems' },
  { kolId: '1662041785', username: '@arcanegems' },
  { kolId: '1413058397', username: '@GambleLounge' },
  { kolId: '1832386664', username: '@BiggieBagsCrypto' },
  { kolId: '1225991487', username: '@bagcalls' },
  { kolId: '1783469467', username: '@RichKidcalls' },
  { kolId: '1877172822', username: '@spacemancallz' },
  { kolId: '1696188050', username: '@CarnagecallsGambles' },
  { kolId: '2086003521', username: '@GenesisChain_Calls' },
  { kolId: '1810124798', username: '@Maestrosdegen' },
  { kolId: '2385226263', username: '@Kulture_Kall' },
  { kolId: '1975392115', username: '@FrenzGems' },
  { kolId: '2054466090', title: 'Cas Gem' },
  { kolId: '1874732560', username: '@LevisGemCalls' },
  { kolId: '1880851888', username: '@metacaller' },
  { kolId: '1819368322', username: '@houseofdegeneracy' },
  { kolId: '1667198684', username: '@TheReaperGems' },
  { kolId: '1500214409', username: '@GemsmineEth' },
  { kolId: '1572093129', username: '@CryptoRocketeerCalls' },
  { kolId: '1523523939', username: '@DegenSeals' },
  { kolId: '1718703340', username: '@batman_gem' },
  { kolId: '1924457034', username: '@LevisAlpha' },
];
