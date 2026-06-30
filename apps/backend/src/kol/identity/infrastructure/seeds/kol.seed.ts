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
  {
    kolId: '2397610468',
    handle: '@KOLscope',
    title: 'KOLscope',
  },
  {
    kolId: '1553109986',
    handle: '@lookonchain',
    title: 'Lookonchain',
  },
  {
    kolId: '1300818502',
    handle: '@trades_johnny',
    title: '🐳Johnny Trades',
  },
  { kolId: '1960616143', title: 'SpyDefi' },
  {
    kolId: '2099286836',
    handle: '@MajorTrending',
    title: '𝗠𝗮𝗷𝗼𝗿 𝗧𝗿𝗲𝗻𝗱𝗶𝗻𝗴 | 𝗦𝗢𝗟 | 𝗕𝗔𝗦𝗘 | 𝗘𝗧𝗛 | 𝗕𝗦𝗖 | 𝗣𝗨𝗠𝗣𝗙𝗨𝗡',
  },
  {
    kolId: '1758611100',
    handle: '@mad_apes_gambles',
    title: 'Gambles 🎲 MadApes',
  },
  {
    kolId: '2088887132',
    handle: '@sadcatgamble',
    title: 'sad cat',
  },
  {
    kolId: '2388486828',
    handle: '@BullishCallsPremium',
    title: 'Bullish Calls - Solana',
  },
  {
    kolId: '1756488143',
    handle: '@lowtaxsolana',
    title: '- SOL -',
  },
  {
    kolId: '1867934972',
    handle: '@walloftrophies',
    title: 'KOL Trending (@CallAnalyser)',
  },
  {
    kolId: '1732891794',
    handle: '@GabbensCalls',
    title: 'Gabbens Calls - Multichain',
  },
  {
    kolId: '2260455569',
    handle: '@PinguimGEMS',
    title: 'Pinguim Gems 🐧 🎰',
  },
  {
    kolId: '1883929251',
    handle: '@gogetagambles',
    title: 'Gogeta Gambles ⚡️',
  },
  {
    kolId: '1654895559',
    handle: '@BurpBoard',
    title: 'BurpBoard by Rick',
  },
  {
    kolId: '1730427571',
    handle: '@CallAnalyser',
    title: 'Call Analyser',
  },
  {
    kolId: '1794471884',
    handle: '@MineGems',
    title: 'Gems Mine',
  },
  {
    kolId: '1697697574',
    handle: '@mad_apes_call',
    title: 'MadApes Calls',
  },
  {
    kolId: '1937478270',
    handle: '@ghastlygems',
    title: "Evee cook\u2019s",
  },
  {
    kolId: '1763265784',
    handle: '@MarkDegens',
    title: 'Mark Degens',
  },
  {
    kolId: '1584420389',
    handle: '@MarkGems',
    title: 'Mark Gems 💎',
  },
  {
    kolId: '1671461751',
    handle: '@CriptoGemas_Anuncios',
    title: 'CriptoGemas Calls',
  },
  {
    kolId: '1824357363',
    handle: '@ramcalls',
    title: "Ram\u2019s Gems Calls ✨ (ONLY CHANNEL)",
  },
  {
    kolId: '1613001878',
    handle: '@buildermanlaunches',
    title: "Builderman\u2019s Roulette",
  },
  {
    kolId: '1992057930',
    handle: '@BasedDegenGems',
    title: 'BASED DEGEN GEMS',
  },
  {
    kolId: '1662041785',
    handle: '@arcanegems',
    title: 'Arcane Gems',
  },
  {
    kolId: '1413058397',
    handle: '@GambleLounge',
    title: "Gambler\u2019s Lounge",
  },
  {
    kolId: '1832386664',
    handle: '@BiggieBagsCrypto',
    title: 'Biggie Bags',
  },
  {
    kolId: '1225991487',
    handle: '@bagcalls',
    title: 'BagCalls 🎒🎒🎒',
  },
  {
    kolId: '1783469467',
    handle: '@RichKidcalls',
    title: 'RichKid Calls',
  },
  {
    kolId: '1877172822',
    handle: '@spacemancallz',
    title: 'Spaceman Callz',
  },
  {
    kolId: '1696188050',
    handle: '@CarnagecallsGambles',
    title: 'CarnageCalls Gambles',
  },
  {
    kolId: '2086003521',
    handle: '@GenesisChain_Calls',
    title: 'GENESIS CHAIN CALLS',
  },
  {
    kolId: '1810124798',
    handle: '@Maestrosdegen',
    title: 'Maestros Gamble Degen Apes',
  },
  {
    kolId: '2385226263',
    handle: '@Kulture_Kall',
    title: 'Kulture_Kall',
  },
  {
    kolId: '1975392115',
    handle: '@FrenzGems',
    title: 'FRENS GEMS 💎',
  },
  { kolId: '2054466090', title: 'Cas Gem' },
  {
    kolId: '1874732560',
    handle: '@LevisGemCalls',
    title: "Levi\u2019s Gem Calls",
  },
  {
    kolId: '1880851888',
    handle: '@metacaller',
    title: 'Meta caller',
  },
  {
    kolId: '1819368322',
    handle: '@houseofdegeneracy',
    title: "Iced\u2019s House of Degeneracy",
  },
  {
    kolId: '1667198684',
    handle: '@TheReaperGems',
    title: 'Reaper Gems',
  },
  {
    kolId: '1500214409',
    handle: '@GemsmineEth',
    title: 'Gems Mine(Gamble)',
  },
  {
    kolId: '1572093129',
    handle: '@CryptoRocketeerCalls',
    title: "Crypto Rocketeer\u2019s Calls 💎",
  },
  {
    kolId: '1523523939',
    handle: '@DegenSeals',
    title: 'Degen Seals',
  },
  {
    kolId: '1718703340',
    handle: '@batman_gem',
    title: 'BATMAN GEMS 🦇',
  },
  {
    kolId: '1924457034',
    handle: '@LevisAlpha',
    title: 'Levis Calls',
  },
];
