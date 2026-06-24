import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import { SettingsPresetEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-preset.entity';
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';

import { CreatePresetDto } from 'settings/api/input/create-preset.dto';
import { UpdatePresetDto } from 'settings/api/input/update-preset.dto';
import { SettingsService } from 'settings/application/services/settings.service';

export interface PresetSignalEntry {
  penalty: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
}

export interface PresetThresholdEntry {
  scope: 'token' | 'kol';
  minScore: number;
  maxScore: number;
  decision: string;
}

export interface PresetSnapshot {
  signals?: Record<string, PresetSignalEntry>;
  thresholds?: PresetThresholdEntry[];
  filters?: Record<string, unknown>;
  classification_thresholds?: Record<string, number>;
  scoring_bonuses?: Record<string, number>;
  honeypot_thresholds?: Record<string, number>;
  score_tiers?: Record<string, number>;
  confidence?: Record<string, number>;
}

@Injectable()
export class SettingsPresetsService {
  private readonly logger = new Logger(SettingsPresetsService.name);

  public constructor(
    @InjectRepository(SettingsPresetEntity)
    private readonly presetsRepo: Repository<SettingsPresetEntity>,
    @InjectRepository(SignalEntity)
    private readonly signalsRepo: Repository<SignalEntity>,
    @InjectRepository(ScoringThresholdEntity)
    private readonly thresholdsRepo: Repository<ScoringThresholdEntity>,
    @InjectRepository(SettingsFilterEntity)
    private readonly filtersRepo: Repository<SettingsFilterEntity>,
    private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
  ) {}

  public async findAll(): Promise<SettingsPresetEntity[]> {
    return this.presetsRepo.find({ order: { name: 'ASC' } });
  }

  public async findById(id: string): Promise<SettingsPresetEntity> {
    const preset = await this.presetsRepo.findOne({ where: { id } });
    if (!preset) {
      throw new NotFoundException(`Preset ${id} not found`);
    }
    return preset;
  }

  public async create(
    input: CreatePresetDto,
    createdBy?: string | null,
  ): Promise<SettingsPresetEntity> {
    const existing = await this.presetsRepo.findOne({
      where: { name: input.name },
    });
    if (existing) {
      throw new BadRequestException(
        `Preset name "${input.name}" already exists`,
      );
    }

    const entity = this.presetsRepo.create({
      name: input.name,
      description: input.description ?? null,
      snapshot: input.snapshot,
      isActive: false,
      createdBy: createdBy ?? null,
    });
    return this.presetsRepo.save(entity);
  }

  public async update(
    id: string,
    input: UpdatePresetDto,
  ): Promise<SettingsPresetEntity> {
    const preset = await this.findById(id);
    if (input.name !== undefined) preset.name = input.name;
    if (input.description !== undefined) preset.description = input.description;
    if (input.snapshot !== undefined) preset.snapshot = input.snapshot;
    return this.presetsRepo.save(preset);
  }

  public async delete(id: string): Promise<void> {
    const preset = await this.findById(id);
    if (preset.isActive) {
      throw new BadRequestException(
        `Cannot delete active preset "${preset.name}". Apply another preset first.`,
      );
    }
    await this.presetsRepo.remove(preset);
  }

  public async getActive(): Promise<SettingsPresetEntity | null> {
    return this.presetsRepo.findOne({ where: { isActive: true } });
  }

  public async applyPreset(
    id: string,
    sourceIp: string | null = null,
  ): Promise<SettingsPresetEntity> {
    const preset = await this.findById(id);
    const snapshot = preset.snapshot as PresetSnapshot;

    const previousActive = await this.getActive();

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        SettingsPresetEntity,
        { isActive: true },
        { isActive: false },
      );
      await manager.update(
        SettingsPresetEntity,
        { id: preset.id },
        { isActive: true },
      );

      await this.applySignalsSnapshot(manager, snapshot.signals);
      await this.applyThresholdsSnapshot(manager, snapshot.thresholds);
      await this.applyFiltersSnapshot(manager, snapshot.filters);

      await manager.save(SettingsAuditLogEntity, {
        entityType: 'settings_preset',
        entityId: preset.id,
        action: 'UPDATE',
        before: previousActive
          ? { id: previousActive.id, name: previousActive.name }
          : null,
        after: {
          id: preset.id,
          name: preset.name,
          appliedAt: new Date().toISOString(),
        },
        sourceIp,
      });
    });

    this.settingsService.invalidateAll();

    this.logger.log(
      `Preset "${preset.name}" (${preset.id}) applied (was: ${previousActive?.name ?? 'none'})`,
    );

    return this.findById(preset.id);
  }

  private async applySignalsSnapshot(
    manager: EntityManager,
    signals: Record<string, PresetSignalEntry> | undefined,
  ): Promise<void> {
    if (!signals) return;
    for (const [code, cfg] of Object.entries(signals)) {
      const existing = await manager.findOne(SignalEntity, {
        where: { code },
      });
      if (existing) {
        existing.penalty = cfg.penalty;
        existing.riskLevel = cfg.riskLevel;
        existing.enabled = cfg.enabled;
        await manager.save(SignalEntity, existing);
      } else {
        const created = manager.create(SignalEntity, {
          code,
          name: code,
          penalty: cfg.penalty,
          riskLevel: cfg.riskLevel,
          enabled: cfg.enabled,
          appliesTo: 'token',
        });
        await manager.save(SignalEntity, created);
      }
    }
  }

  private async applyThresholdsSnapshot(
    manager: EntityManager,
    thresholds: PresetThresholdEntry[] | undefined,
  ): Promise<void> {
    if (!thresholds) return;
    for (const t of thresholds) {
      const existing = await manager.findOne(ScoringThresholdEntity, {
        where: {
          scope: t.scope,
          minScore: t.minScore,
          maxScore: t.maxScore,
        },
      });
      if (existing) {
        existing.decision = t.decision;
        await manager.save(ScoringThresholdEntity, existing);
      } else {
        const created = manager.create(ScoringThresholdEntity, {
          scope: t.scope,
          minScore: t.minScore,
          maxScore: t.maxScore,
          decision: t.decision,
        });
        await manager.save(ScoringThresholdEntity, created);
      }
    }
  }

  private async applyFiltersSnapshot(
    manager: EntityManager,
    filters: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!filters) return;
    for (const [type, raw] of Object.entries(filters)) {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        await this.upsertScalarFilter(manager, type, '', raw);
      } else if (typeof raw === 'string') {
        await this.upsertScalarFilter(manager, type, raw, null);
      } else if (typeof raw === 'boolean') {
        await this.upsertScalarFilter(
          manager,
          type,
          raw ? 'true' : 'false',
          null,
        );
      } else if (Array.isArray(raw)) {
        await manager.delete(SettingsFilterEntity, { type, scope: 'global' });
        for (const item of raw) {
          if (typeof item === 'number' && Number.isFinite(item)) {
            await this.insertFilterRow(manager, type, '', item);
          } else if (typeof item === 'string') {
            await this.insertFilterRow(manager, type, item, null);
          } else {
            this.logger.warn(
              `Skipping unsupported array item for filter "${type}": ${typeof item}`,
            );
          }
        }
      } else if (raw !== null && typeof raw === 'object') {
        this.logger.warn(
          `Skipping non-representable filter "${type}" (object shape — not supported by settings_filters schema)`,
        );
      }
    }
  }

  private async upsertScalarFilter(
    manager: EntityManager,
    type: string,
    value: string,
    numericValue: number | null,
  ): Promise<void> {
    const existing = await manager.findOne(SettingsFilterEntity, {
      where: { type, scope: 'global' },
    });
    if (existing) {
      existing.value = value;
      existing.numericValue = numericValue;
      existing.enabled = true;
      await manager.save(SettingsFilterEntity, existing);
    } else {
      await this.insertFilterRow(manager, type, value, numericValue);
    }
  }

  private async insertFilterRow(
    manager: EntityManager,
    type: string,
    value: string,
    numericValue: number | null,
  ): Promise<void> {
    const created = manager.create(SettingsFilterEntity, {
      type,
      value,
      numericValue,
      scope: 'global',
      enabled: true,
    });
    await manager.save(SettingsFilterEntity, created);
  }
}
