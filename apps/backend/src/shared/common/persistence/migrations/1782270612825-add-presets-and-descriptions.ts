import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPresetsAndDescriptions1782270612825 implements MigrationInterface {
  name = 'AddPresetsAndDescriptions1782270612825';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE settings_filters ADD COLUMN IF NOT EXISTS "description" TEXT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS settings_presets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT NULL,
        snapshot JSONB NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by VARCHAR(100) NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_preset
        ON settings_presets (is_active)
        WHERE is_active = true
    `);

    const existing = await queryRunner.query(
      `SELECT 1 FROM settings_presets WHERE name = $1 LIMIT 1`,
      ['Default'],
    );
    if (existing.length === 0) {
      const signalsRows: Array<{
        code: string;
        penalty: number;
        risk_level: string;
        enabled: boolean;
      }> = await queryRunner.query(
        `SELECT code, penalty, risk_level, enabled FROM signals`,
      );
      const signals: Record<
        string,
        { penalty: number; riskLevel: string; enabled: boolean }
      > = {};
      for (const row of signalsRows) {
        signals[row.code] = {
          penalty: row.penalty,
          riskLevel: row.risk_level,
          enabled: row.enabled,
        };
      }

      const thresholdsRows: Array<{
        scope: string;
        min_score: number;
        max_score: number;
        decision: string;
      }> = await queryRunner.query(
        `SELECT scope, min_score, max_score, decision FROM scoring_thresholds`,
      );
      const thresholds = thresholdsRows.map((r) => ({
        scope: r.scope,
        minScore: r.min_score,
        maxScore: r.max_score,
        decision: r.decision,
      }));

      const defaultSnapshot = {
        signals,
        thresholds,
        filters: {
          base_score: 50,
          min_score: 50,
          max_risk_weight: 100,
          min_completeness: 0.3,
          blocked_classification: ['SCAM', 'UNKNOWN'],
          publishable_chain: ['ethereum', 'solana'],
          honeypot_score: 10,
          honeypot_risk: 80,
          bundlers_threshold: 30,
          insiders_threshold: 50,
          bonding_threshold: 99,
          kol_trusted_score: 0.7,
          kol_suspicious_score: 0.3,
          kol_score_base: 0.5,
          kol_score_slope: 0.5,
          kol_confidence_low: 5,
          kol_confidence_medium: 20,
          kol_confidence_high: 50,
          multiplier_pivot: 0.5,
          multiplier_slope: 0.3,
          security_cap: {
            SCAM: 5,
            SUSPICIOUS: 30,
            UNKNOWN: 20,
            LEGITIMATE: 100,
          },
        },
        classification_thresholds: {
          low_liquidity_high: 1000,
          low_liquidity_medium: 5000,
          no_holders_high: 0,
          no_holders_medium: 50,
          concentrated_holders_high: 80,
          extreme_price_change_high: 500,
          microcap_high: 1000,
          completeness_unknown: 0.3,
        },
        scoring_bonuses: {
          liquidity_high: 20,
          liquidity_medium: 10,
          liquidity_low: 5,
          liquidity_insufficient: -10,
          liquidity_threshold_high: 50000,
          liquidity_threshold_medium: 10000,
          liquidity_threshold_low: 1000,
          holders_high: 15,
          holders_medium: 8,
          holders_low: 3,
          holders_none: -10,
          holders_threshold_high: 1000,
          holders_threshold_medium: 100,
          holders_threshold_low: 10,
          mc_high: 10,
          mc_medium: 5,
          mc_low: 2,
          mc_threshold_high: 1000000,
          mc_threshold_medium: 100000,
          mc_threshold_low: 10000,
          volume_high: 5,
          volume_low: 2,
          volume_threshold_high: 50000,
          volume_threshold_low: 10000,
          buzz_multi_source: 10,
          buzz_two_sources: 5,
          buzz_multi_mentions: 5,
          buzz_two_mentions: 2,
        },
        honeypot_thresholds: {
          owner_can_drain_liquidity: 100,
          honeypot_flag_microcap: 1000,
          honeypot_flag_extreme_price: 500,
          honeypot_flag_critical_price: 1000,
          honeypot_flag_new_pair_age_ms: 3600000,
          honeypot_flag_new_pair_price: 200,
          high_buy_tax_ratio: 100,
          high_transfer_tax_price_impact: 0.5,
          high_transfer_tax_pair_age_ms: 86400000,
          can_sell_buy_liquidity: 100,
        },
        score_tiers: {
          strong_min: 80,
          decent_min: 60,
          neutral_min: 40,
          risky_min: 20,
        },
        confidence: {
          TOKEN: 0.7,
          POOL: 0.5,
          ROUTER: 0.5,
          NFT: 0.5,
          SCAM: 0.6,
          UNKNOWN: 0.4,
          completeness_bonus: 0.2,
          risk_penalty_max: 0.4,
          unknown_kol_default: 0.5,
        },
      };

      await queryRunner.query(
        `INSERT INTO settings_presets (name, description, snapshot, is_active)
         VALUES ($1, $2, $3::jsonb, true)`,
        [
          'Default',
          'Out-of-the-box configuration. Mirrors the values that were hardcoded before settings were exposed in the UI.',
          JSON.stringify(defaultSnapshot),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_one_active_preset`);
    await queryRunner.query(`DROP TABLE IF EXISTS settings_presets`);
    await queryRunner.query(
      `ALTER TABLE settings_filters DROP COLUMN IF EXISTS "description"`,
    );
  }
}
