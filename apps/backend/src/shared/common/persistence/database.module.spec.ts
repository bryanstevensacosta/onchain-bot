import { isProductionLikeEnvironment } from './database.module';

describe('database.module', () => {
  describe('isProductionLikeEnvironment', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });

    it('should return true when NODE_ENV is "staging"', () => {
      process.env.NODE_ENV = 'staging';
      expect(isProductionLikeEnvironment()).toBe(true);
    });

    it('should return true when NODE_ENV is "production"', () => {
      process.env.NODE_ENV = 'production';
      expect(isProductionLikeEnvironment()).toBe(true);
    });

    it('should return true when NODE_ENV is "STAGING" (uppercase)', () => {
      process.env.NODE_ENV = 'STAGING';
      expect(isProductionLikeEnvironment()).toBe(true);
    });

    it('should return true when NODE_ENV is "PRODUCTION" (uppercase)', () => {
      process.env.NODE_ENV = 'PRODUCTION';
      expect(isProductionLikeEnvironment()).toBe(true);
    });

    it('should return true when NODE_ENV is "StAgInG" (mixed case)', () => {
      process.env.NODE_ENV = 'StAgInG';
      expect(isProductionLikeEnvironment()).toBe(true);
    });

    it('should return true when NODE_ENV is "PrOdUcTiOn" (mixed case)', () => {
      process.env.NODE_ENV = 'PrOdUcTiOn';
      expect(isProductionLikeEnvironment()).toBe(true);
    });

    it('should return false when NODE_ENV is "development"', () => {
      process.env.NODE_ENV = 'development';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is "test"', () => {
      process.env.NODE_ENV = 'test';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is undefined', () => {
      delete process.env.NODE_ENV;
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is empty string', () => {
      process.env.NODE_ENV = '';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is an arbitrary value', () => {
      process.env.NODE_ENV = 'custom-environment';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is "local"', () => {
      process.env.NODE_ENV = 'local';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is "dev"', () => {
      process.env.NODE_ENV = 'dev';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is "qa"', () => {
      process.env.NODE_ENV = 'qa';
      expect(isProductionLikeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is "uat"', () => {
      process.env.NODE_ENV = 'uat';
      expect(isProductionLikeEnvironment()).toBe(false);
    });
  });
});
