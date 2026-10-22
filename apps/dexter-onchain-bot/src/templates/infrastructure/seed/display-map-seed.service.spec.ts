import { DisplayResolverService } from '@/templates/application/display-resolver.service';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import {
  DisplayMapDuplicateError,
  DisplayMapValidationError,
} from '@/templates/domain/display-map.validators';
import { InMemoryDisplayMapRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-display-map.repository';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import seedRows from './data/display-maps.seed.json';
import {
  parseDisplayMapSeed,
  prepareSeedCliEnv,
  seedDisplayMaps,
} from './display-map-seed.service';

describe('parseDisplayMapSeed', () => {
  it('parses the shipped catalog into exactly the three label rows', () => {
    expect(parseDisplayMapSeed(seedRows)).toEqual([
      { placeholderKey: 'chain', matchValue: 'solana', display: '🟣' },
      {
        placeholderKey: 'launchpadName',
        matchValue: 'pump-fun',
        display: 'Pump',
      },
      { placeholderKey: 'chain', matchValue: 'bsc', display: '🟡' },
    ]);
  });

  it('rejects a non-array or an empty catalog', () => {
    expect(() => parseDisplayMapSeed({})).toThrow(DisplayMapValidationError);
    expect(() => parseDisplayMapSeed([])).toThrow(DisplayMapValidationError);
  });

  it('rejects a row with extra keys', () => {
    expect(() =>
      parseDisplayMapSeed([
        {
          placeholderKey: 'chain',
          matchValue: 'solana',
          display: '🟣',
          note: 'not allowed',
        },
      ]),
    ).toThrow(/exactly display, matchValue, placeholderKey/);
  });

  it('rejects an unknown placeholderKey via the domain whitelist', () => {
    expect(() =>
      parseDisplayMapSeed([
        { placeholderKey: 'notAKey', matchValue: 'solana', display: '🟣' },
      ]),
    ).toThrow(DisplayMapValidationError);
  });

  it('rejects duplicates after normalization (Pump-Fun vs pump-fun)', () => {
    expect(() =>
      parseDisplayMapSeed([
        {
          placeholderKey: 'launchpadName',
          matchValue: 'Pump-Fun',
          display: 'Pump',
        },
        {
          placeholderKey: 'launchpadName',
          matchValue: 'pump-fun',
          display: 'Pump',
        },
      ]),
    ).toThrow(/duplicates/);
  });
});

describe('seedDisplayMaps', () => {
  let repo: InMemoryDisplayMapRepository;

  beforeEach(() => {
    repo = new InMemoryDisplayMapRepository();
  });

  it('counts pending rows in dry-run and writes nothing', async () => {
    const rows = parseDisplayMapSeed(seedRows);
    const report = await seedDisplayMaps(repo, rows, { dryRun: true });

    expect(report).toEqual({
      created: 0,
      skipped: 0,
      wouldCreate: 3,
      drift: [],
    });
    expect(await repo.findAll()).toHaveLength(0);
  });

  it('creates all three rows on apply', async () => {
    const rows = parseDisplayMapSeed(seedRows);
    const report = await seedDisplayMaps(repo, rows, { dryRun: false });

    expect(report).toEqual({
      created: 3,
      skipped: 0,
      wouldCreate: 0,
      drift: [],
    });
    expect(await repo.findAll()).toHaveLength(3);
  });

  it('is idempotent: the second run creates nothing', async () => {
    const rows = parseDisplayMapSeed(seedRows);
    await seedDisplayMaps(repo, rows, { dryRun: false });
    const second = await seedDisplayMaps(repo, rows, { dryRun: false });

    expect(second).toEqual({
      created: 0,
      skipped: 3,
      wouldCreate: 0,
      drift: [],
    });
    expect(await repo.findAll()).toHaveLength(3);
  });

  it('reports drift and never overwrites an operator row', async () => {
    await repo.save(
      DisplayMap.create({
        placeholderKey: 'chain',
        matchValue: 'solana',
        display: 'SOL',
      }),
    );
    const rows = parseDisplayMapSeed([
      { placeholderKey: 'chain', matchValue: 'solana', display: '🟣' },
    ]);

    const report = await seedDisplayMaps(repo, rows, { dryRun: false });

    expect(report.created).toBe(0);
    expect(report.skipped).toBe(1);
    expect(report.drift).toEqual([
      {
        placeholderKey: 'chain',
        matchValue: 'solana',
        seedDisplay: '🟣',
        existingDisplay: 'SOL',
      },
    ]);
    const stored = await repo.findAll();
    expect(stored.map((map) => map.display)).toEqual(['SOL']);
  });

  it('counts a save race as skipped instead of aborting', async () => {
    class RacingRepository extends InMemoryDisplayMapRepository {
      public override async save(): Promise<DisplayMap> {
        throw new DisplayMapDuplicateError('raced with another writer');
      }
    }
    const racing = new RacingRepository();
    const rows = parseDisplayMapSeed([
      { placeholderKey: 'chain', matchValue: 'solana', display: '🟣' },
    ]);

    const report = await seedDisplayMaps(racing, rows, { dryRun: false });

    expect(report.created).toBe(0);
    expect(report.skipped).toBe(1);
  });
});

describe('prepareSeedCliEnv', () => {
  it('disables the template seed hook and the update poller', () => {
    const savedTemplates = process.env.DEXTER_SEED_TEMPLATES;
    const savedMode = process.env.DEXTER_INGEST_MODE;
    try {
      delete process.env.DEXTER_SEED_TEMPLATES;
      delete process.env.DEXTER_INGEST_MODE;

      prepareSeedCliEnv();

      expect(process.env.DEXTER_SEED_TEMPLATES).toBe('false');
      expect(process.env.DEXTER_INGEST_MODE).toBe('webhook');
    } finally {
      if (savedTemplates === undefined) {
        delete process.env.DEXTER_SEED_TEMPLATES;
      } else {
        process.env.DEXTER_SEED_TEMPLATES = savedTemplates;
      }
      if (savedMode === undefined) {
        delete process.env.DEXTER_INGEST_MODE;
      } else {
        process.env.DEXTER_INGEST_MODE = savedMode;
      }
    }
  });
});

describe('seed → resolver → renderer integration', () => {
  it('renders the exact label 🟣 Solana @ Pump', async () => {
    const repo = new InMemoryDisplayMapRepository();
    const rows = parseDisplayMapSeed(seedRows);
    await seedDisplayMaps(repo, rows, { dryRun: false });

    const resolver = new DisplayResolverService(repo);
    await resolver.refresh();
    const renderer = new TemplateRendererService(resolver);

    const out = renderer.render(
      '{{chainDisplay}} {{chainName}}{{venueSuffixShort}}',
      {
        chain: 'solana',
        launchpad: {
          id: 'pump-fun',
          name: 'Pump.fun',
          url: 'https://pump.fun/coin/SQ1W9zWdVDgaageGKp228hp2boGRzR3T7iRyd4fpump',
        },
        venue: { dexId: 'pumpswap', labels: [] },
      },
    );

    expect(out.text).toBe('🟣 Solana @ Pump');
    expect(out.placeholdersUsed).toEqual([
      'chainDisplay',
      'chainName',
      'venueSuffixShort',
    ]);
  });

  it('stays silent when the token has no launchpad (flat rule)', async () => {
    const repo = new InMemoryDisplayMapRepository();
    await seedDisplayMaps(repo, parseDisplayMapSeed(seedRows), {
      dryRun: false,
    });
    const resolver = new DisplayResolverService(repo);
    await resolver.refresh();
    const renderer = new TemplateRendererService(resolver);

    const out = renderer.render(
      '{{chainDisplay}} {{chainName}}{{venueSuffixShort}}',
      {
        chain: 'solana',
        venue: null,
      },
    );

    expect(out.text).toBe('🟣 Solana');
  });
});
