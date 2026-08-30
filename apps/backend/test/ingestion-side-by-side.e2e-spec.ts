import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Side-by-Side Validation Test for Centralized Ingestion Service
 *
 * Validates: Requirements 12.2, 12.3
 *
 * Purpose: Compare prod backend (MTProto mode) vs staging backend (SSE mode)
 * during the 48-hour side-by-side validation phase (Phase 9.3).
 *
 * This test assumes:
 * 1. Prod backend runs with INGESTION_MODE=local (MTProto)
 * 2. Staging backend runs with INGESTION_MODE=remote (SSE)
 * 3. Both backends share the same Telegram channels configuration
 * 4. Test connects to both databases to compare results
 *
 * Success Criteria:
 * - ≥99.9% message parity between prod and staging
 * - Identical KOL extraction results for same messages
 * - Identical crypto-news keyword matches
 * - Zero data loss in SSE mode
 */

interface MessageParityReport {
  prodMessageCount: number;
  stagingMessageCount: number;
  parityPercentage: number;
  missingInStaging: number;
  missingInProd: number;
  passesThreshold: boolean; // ≥99.9%
}

interface KolExtractionReport {
  totalMessages: number;
  identicalExtractions: number;
  differingExtractions: number;
  parityPercentage: number;
  sampledDifferences: Array<{
    messageId: number;
    channelId: string;
    prodCandidates: number;
    stagingCandidates: number;
    prodTickers: string[];
    stagingTickers: string[];
  }>;
}

interface CryptoNewsReport {
  totalNewsMessages: number;
  identicalKeywordMatches: number;
  differingKeywordMatches: number;
  parityPercentage: number;
  sampledDifferences: Array<{
    messageId: number;
    channelId: string;
    prodKeywords: string[];
    stagingKeywords: string[];
  }>;
}

interface ValidationReport {
  testStartedAt: Date;
  testCompletedAt: Date;
  validationWindowHours: number;
  messageParity: MessageParityReport;
  kolExtraction: KolExtractionReport;
  cryptoNews: CryptoNewsReport;
  overallSuccess: boolean;
}

describe('Ingestion Side-by-Side Validation (e2e)', () => {
  let prodDataSource: DataSource;
  let stagingDataSource: DataSource;
  let logger: Logger;

  // Configuration for database connections
  const PROD_DB_CONFIG = {
    host: process.env.PROD_DB_HOST || 'localhost',
    port: parseInt(process.env.PROD_DB_PORT || '5432', 10),
    database: process.env.PROD_DB_NAME || 'onchain_bot_prod',
    username: process.env.PROD_DB_USER || 'postgres',
    password: process.env.PROD_DB_PASSWORD || 'postgres',
  };

  const STAGING_DB_CONFIG = {
    host: process.env.STAGING_DB_HOST || 'localhost',
    port: parseInt(process.env.STAGING_DB_PORT || '5433', 10),
    database: process.env.STAGING_DB_NAME || 'onchain_bot_staging',
    username: process.env.STAGING_DB_USER || 'postgres',
    password: process.env.STAGING_DB_PASSWORD || 'postgres',
  };

  // Validation window (default 48 hours for Phase 9.3)
  const VALIDATION_WINDOW_HOURS = parseInt(
    process.env.VALIDATION_WINDOW_HOURS || '48',
    10,
  );

  const PARITY_THRESHOLD = 99.9; // Requirement 12.2: ≥99.9%

  beforeAll(async () => {
    logger = new Logger('SideBySideValidation');

    // Connect to prod database
    prodDataSource = new DataSource({
      type: 'postgres',
      ...PROD_DB_CONFIG,
      synchronize: false,
      logging: false,
    });
    await prodDataSource.initialize();
    logger.log(`Connected to prod database: ${PROD_DB_CONFIG.database}`);

    // Connect to staging database
    stagingDataSource = new DataSource({
      type: 'postgres',
      ...STAGING_DB_CONFIG,
      synchronize: false,
      logging: false,
    });
    await stagingDataSource.initialize();
    logger.log(
      `Connected to staging database: ${STAGING_DB_CONFIG.database}`,
    );
  });

  afterAll(async () => {
    if (prodDataSource?.isInitialized) {
      await prodDataSource.destroy();
      logger.log('Disconnected from prod database');
    }
    if (stagingDataSource?.isInitialized) {
      await stagingDataSource.destroy();
      logger.log('Disconnected from staging database');
    }
  });

  describe('Message Parity Validation', () => {
    it('should achieve ≥99.9% message parity between prod and staging', async () => {
      const testStartedAt = new Date();
      const windowStartTime = new Date(
        Date.now() - VALIDATION_WINDOW_HOURS * 60 * 60 * 1000,
      );

      logger.log(
        `Validating message parity from ${windowStartTime.toISOString()} to ${testStartedAt.toISOString()}`,
      );

      // Query prod messages in validation window
      const prodMessages = await prodDataSource.query(
        `
        SELECT channel_id, message_id, occurred_at
        FROM telegram_raw_messages
        WHERE occurred_at >= $1
        ORDER BY channel_id, message_id
        `,
        [windowStartTime],
      );

      // Query staging messages in validation window
      const stagingMessages = await stagingDataSource.query(
        `
        SELECT channel_id, message_id, occurred_at
        FROM telegram_raw_messages
        WHERE occurred_at >= $1
        ORDER BY channel_id, message_id
        `,
        [windowStartTime],
      );

      logger.log(`Prod messages: ${prodMessages.length}`);
      logger.log(`Staging messages: ${stagingMessages.length}`);

      // Build message sets for comparison
      const prodSet = new Set(
        prodMessages.map(
          (m: any) => `${m.channel_id}:${m.message_id}`,
        ),
      );
      const stagingSet = new Set(
        stagingMessages.map(
          (m: any) => `${m.channel_id}:${m.message_id}`,
        ),
      );

      // Calculate differences
      const missingInStaging = [...prodSet].filter((id) => !stagingSet.has(id));
      const missingInProd = [...stagingSet].filter((id) => !prodSet.has(id));

      const totalMessages = Math.max(prodMessages.length, stagingMessages.length);
      const matchingMessages = totalMessages - missingInStaging.length;
      const parityPercentage = totalMessages > 0
        ? (matchingMessages / totalMessages) * 100
        : 100;

      const report: MessageParityReport = {
        prodMessageCount: prodMessages.length,
        stagingMessageCount: stagingMessages.length,
        parityPercentage,
        missingInStaging: missingInStaging.length,
        missingInProd: missingInProd.length,
        passesThreshold: parityPercentage >= PARITY_THRESHOLD,
      };

      // Log report
      logger.log('=== MESSAGE PARITY REPORT ===');
      logger.log(`Prod messages: ${report.prodMessageCount}`);
      logger.log(`Staging messages: ${report.stagingMessageCount}`);
      logger.log(`Parity: ${report.parityPercentage.toFixed(3)}%`);
      logger.log(`Missing in staging: ${report.missingInStaging}`);
      logger.log(`Missing in prod: ${report.missingInProd}`);
      logger.log(`Threshold met (≥99.9%): ${report.passesThreshold ? 'YES' : 'NO'}`);

      if (missingInStaging.length > 0) {
        logger.warn(
          `Sample of messages missing in staging: ${missingInStaging.slice(0, 10).join(', ')}`,
        );
      }
      if (missingInProd.length > 0) {
        logger.warn(
          `Sample of messages missing in prod: ${missingInProd.slice(0, 10).join(', ')}`,
        );
      }

      // Requirement 12.2: ≥99.9% message parity
      expect(report.passesThreshold).toBe(true);
      expect(parityPercentage).toBeGreaterThanOrEqual(PARITY_THRESHOLD);
    }, 60000); // 60s timeout
  });

  describe('KOL Extraction Parity Validation', () => {
    it('should produce identical KOL extraction results for same messages', async () => {
      const windowStartTime = new Date(
        Date.now() - VALIDATION_WINDOW_HOURS * 60 * 60 * 1000,
      );

      logger.log(
        `Validating KOL extraction parity from ${windowStartTime.toISOString()}`,
      );

      // Query prod KOL extraction results
      const prodExtractions = await prodDataSource.query(
        `
        SELECT 
          trm.channel_id,
          trm.message_id,
          trm.occurred_at,
          COUNT(DISTINCT ec.ticker) as candidate_count,
          ARRAY_AGG(DISTINCT ec.ticker ORDER BY ec.ticker) as tickers
        FROM telegram_raw_messages trm
        LEFT JOIN extraction_candidates ec ON ec.raw_message_id = trm.id
        WHERE trm.occurred_at >= $1
          AND EXISTS (
            SELECT 1 FROM kol_sources ks
            WHERE ks.channel_id = trm.channel_id
          )
        GROUP BY trm.channel_id, trm.message_id, trm.occurred_at
        ORDER BY trm.occurred_at
        `,
        [windowStartTime],
      );

      // Query staging KOL extraction results
      const stagingExtractions = await stagingDataSource.query(
        `
        SELECT 
          trm.channel_id,
          trm.message_id,
          trm.occurred_at,
          COUNT(DISTINCT ec.ticker) as candidate_count,
          ARRAY_AGG(DISTINCT ec.ticker ORDER BY ec.ticker) as tickers
        FROM telegram_raw_messages trm
        LEFT JOIN extraction_candidates ec ON ec.raw_message_id = trm.id
        WHERE trm.occurred_at >= $1
          AND EXISTS (
            SELECT 1 FROM kol_sources ks
            WHERE ks.channel_id = trm.channel_id
          )
        GROUP BY trm.channel_id, trm.message_id, trm.occurred_at
        ORDER BY trm.occurred_at
        `,
        [windowStartTime],
      );

      logger.log(`Prod KOL extractions: ${prodExtractions.length}`);
      logger.log(`Staging KOL extractions: ${stagingExtractions.length}`);

      // Build lookup maps
      const prodMap = new Map(
        prodExtractions.map((e: any) => [
          `${e.channel_id}:${e.message_id}`,
          e,
        ]),
      );
      const stagingMap = new Map(
        stagingExtractions.map((e: any) => [
          `${e.channel_id}:${e.message_id}`,
          e,
        ]),
      );

      // Compare extractions
      let identicalCount = 0;
      let differingCount = 0;
      const sampledDifferences: any[] = [];

      for (const [key, prodExtraction] of prodMap.entries()) {
        const stagingExtraction = stagingMap.get(key);

        if (!stagingExtraction) {
          differingCount++;
          if (sampledDifferences.length < 10) {
            sampledDifferences.push({
              messageId: prodExtraction.message_id,
              channelId: prodExtraction.channel_id,
              prodCandidates: prodExtraction.candidate_count,
              stagingCandidates: 0,
              prodTickers: prodExtraction.tickers || [],
              stagingTickers: [],
            });
          }
          continue;
        }

        // Compare tickers (normalized)
        const prodTickers = (prodExtraction.tickers || [])
          .filter((t: string) => t)
          .sort();
        const stagingTickers = (stagingExtraction.tickers || [])
          .filter((t: string) => t)
          .sort();

        if (JSON.stringify(prodTickers) === JSON.stringify(stagingTickers)) {
          identicalCount++;
        } else {
          differingCount++;
          if (sampledDifferences.length < 10) {
            sampledDifferences.push({
              messageId: prodExtraction.message_id,
              channelId: prodExtraction.channel_id,
              prodCandidates: prodExtraction.candidate_count,
              stagingCandidates: stagingExtraction.candidate_count,
              prodTickers,
              stagingTickers,
            });
          }
        }
      }

      const totalMessages = prodMap.size;
      const parityPercentage = totalMessages > 0
        ? (identicalCount / totalMessages) * 100
        : 100;

      const report: KolExtractionReport = {
        totalMessages,
        identicalExtractions: identicalCount,
        differingExtractions: differingCount,
        parityPercentage,
        sampledDifferences,
      };

      // Log report
      logger.log('=== KOL EXTRACTION REPORT ===');
      logger.log(`Total messages: ${report.totalMessages}`);
      logger.log(`Identical extractions: ${report.identicalExtractions}`);
      logger.log(`Differing extractions: ${report.differingExtractions}`);
      logger.log(`Parity: ${report.parityPercentage.toFixed(3)}%`);

      if (sampledDifferences.length > 0) {
        logger.warn('Sample of differing extractions:');
        sampledDifferences.forEach((diff, idx) => {
          logger.warn(
            `  ${idx + 1}. Channel: ${diff.channelId}, Message: ${diff.messageId}`,
          );
          logger.warn(`     Prod tickers: [${diff.prodTickers.join(', ')}]`);
          logger.warn(`     Staging tickers: [${diff.stagingTickers.join(', ')}]`);
        });
      }

      // Requirement 12.2: Identical extraction results
      expect(report.parityPercentage).toBeGreaterThanOrEqual(PARITY_THRESHOLD);
      expect(report.differingExtractions).toBeLessThanOrEqual(
        Math.ceil(totalMessages * 0.001), // Allow 0.1% difference
      );
    }, 60000); // 60s timeout
  });

  describe('Crypto News Keyword Match Parity Validation', () => {
    it('should produce identical crypto-news keyword matches', async () => {
      const windowStartTime = new Date(
        Date.now() - VALIDATION_WINDOW_HOURS * 60 * 60 * 1000,
      );

      logger.log(
        `Validating crypto-news keyword parity from ${windowStartTime.toISOString()}`,
      );

      // Query prod crypto-news keyword matches
      const prodNews = await prodDataSource.query(
        `
        SELECT 
          trm.channel_id,
          trm.message_id,
          trm.occurred_at,
          ARRAY_AGG(DISTINCT cnkm.keyword ORDER BY cnkm.keyword) as matched_keywords
        FROM telegram_raw_messages trm
        LEFT JOIN crypto_news_keyword_matches cnkm ON cnkm.message_id = trm.id
        WHERE trm.occurred_at >= $1
          AND EXISTS (
            SELECT 1 FROM crypto_news_sources cns
            WHERE cns.channel_id = trm.channel_id
          )
        GROUP BY trm.channel_id, trm.message_id, trm.occurred_at
        ORDER BY trm.occurred_at
        `,
        [windowStartTime],
      );

      // Query staging crypto-news keyword matches
      const stagingNews = await stagingDataSource.query(
        `
        SELECT 
          trm.channel_id,
          trm.message_id,
          trm.occurred_at,
          ARRAY_AGG(DISTINCT cnkm.keyword ORDER BY cnkm.keyword) as matched_keywords
        FROM telegram_raw_messages trm
        LEFT JOIN crypto_news_keyword_matches cnkm ON cnkm.message_id = trm.id
        WHERE trm.occurred_at >= $1
          AND EXISTS (
            SELECT 1 FROM crypto_news_sources cns
            WHERE cns.channel_id = trm.channel_id
          )
        GROUP BY trm.channel_id, trm.message_id, trm.occurred_at
        ORDER BY trm.occurred_at
        `,
        [windowStartTime],
      );

      logger.log(`Prod crypto-news messages: ${prodNews.length}`);
      logger.log(`Staging crypto-news messages: ${stagingNews.length}`);

      // Build lookup maps
      const prodMap = new Map(
        prodNews.map((e: any) => [
          `${e.channel_id}:${e.message_id}`,
          e,
        ]),
      );
      const stagingMap = new Map(
        stagingNews.map((e: any) => [
          `${e.channel_id}:${e.message_id}`,
          e,
        ]),
      );

      // Compare keyword matches
      let identicalCount = 0;
      let differingCount = 0;
      const sampledDifferences: any[] = [];

      for (const [key, prodNews] of prodMap.entries()) {
        const stagingNews = stagingMap.get(key);

        if (!stagingNews) {
          differingCount++;
          if (sampledDifferences.length < 10) {
            sampledDifferences.push({
              messageId: prodNews.message_id,
              channelId: prodNews.channel_id,
              prodKeywords: prodNews.matched_keywords || [],
              stagingKeywords: [],
            });
          }
          continue;
        }

        // Compare keywords (normalized)
        const prodKeywords = (prodNews.matched_keywords || [])
          .filter((k: string) => k)
          .sort();
        const stagingKeywords = (stagingNews.matched_keywords || [])
          .filter((k: string) => k)
          .sort();

        if (JSON.stringify(prodKeywords) === JSON.stringify(stagingKeywords)) {
          identicalCount++;
        } else {
          differingCount++;
          if (sampledDifferences.length < 10) {
            sampledDifferences.push({
              messageId: prodNews.message_id,
              channelId: prodNews.channel_id,
              prodKeywords,
              stagingKeywords,
            });
          }
        }
      }

      const totalMessages = prodMap.size;
      const parityPercentage = totalMessages > 0
        ? (identicalCount / totalMessages) * 100
        : 100;

      const report: CryptoNewsReport = {
        totalNewsMessages: totalMessages,
        identicalKeywordMatches: identicalCount,
        differingKeywordMatches: differingCount,
        parityPercentage,
        sampledDifferences,
      };

      // Log report
      logger.log('=== CRYPTO NEWS KEYWORD REPORT ===');
      logger.log(`Total messages: ${report.totalNewsMessages}`);
      logger.log(`Identical keyword matches: ${report.identicalKeywordMatches}`);
      logger.log(`Differing keyword matches: ${report.differingKeywordMatches}`);
      logger.log(`Parity: ${report.parityPercentage.toFixed(3)}%`);

      if (sampledDifferences.length > 0) {
        logger.warn('Sample of differing keyword matches:');
        sampledDifferences.forEach((diff, idx) => {
          logger.warn(
            `  ${idx + 1}. Channel: ${diff.channelId}, Message: ${diff.messageId}`,
          );
          logger.warn(`     Prod keywords: [${diff.prodKeywords.join(', ')}]`);
          logger.warn(`     Staging keywords: [${diff.stagingKeywords.join(', ')}]`);
        });
      }

      // Requirement 12.2: Identical crypto-news processing
      expect(report.parityPercentage).toBeGreaterThanOrEqual(PARITY_THRESHOLD);
      expect(report.differingKeywordMatches).toBeLessThanOrEqual(
        Math.ceil(totalMessages * 0.001), // Allow 0.1% difference
      );
    }, 60000); // 60s timeout
  });

  describe('Overall Validation Report', () => {
    it('should generate comprehensive validation report', async () => {
      const testStartedAt = new Date();
      const windowStartTime = new Date(
        Date.now() - VALIDATION_WINDOW_HOURS * 60 * 60 * 1000,
      );

      logger.log('=== GENERATING COMPREHENSIVE VALIDATION REPORT ===');
      logger.log(`Validation window: ${VALIDATION_WINDOW_HOURS} hours`);
      logger.log(`From: ${windowStartTime.toISOString()}`);
      logger.log(`To: ${testStartedAt.toISOString()}`);
      logger.log(`Parity threshold: ${PARITY_THRESHOLD}%`);

      // This test serves as documentation and doesn't fail
      // Individual tests above enforce pass/fail criteria
      expect(VALIDATION_WINDOW_HOURS).toBeGreaterThan(0);
      expect(PARITY_THRESHOLD).toBe(99.9);
    });
  });
});
