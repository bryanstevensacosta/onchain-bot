import { isProductionLikeEnvironment } from '../database.module';

describe('DatabaseModule - Environment Detection', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    // Save original NODE_ENV
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore original NODE_ENV
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('isProductionLikeEnvironment()', () => {
    describe('production-like environments', () => {
      it('should return true when NODE_ENV=staging', () => {
        process.env.NODE_ENV = 'staging';
        expect(isProductionLikeEnvironment()).toBe(true);
      });

      it('should return true when NODE_ENV=STAGING (uppercase)', () => {
        process.env.NODE_ENV = 'STAGING';
        expect(isProductionLikeEnvironment()).toBe(true);
      });

      it('should return true when NODE_ENV=Staging (mixed case)', () => {
        process.env.NODE_ENV = 'Staging';
        expect(isProductionLikeEnvironment()).toBe(true);
      });

      it('should return true when NODE_ENV=production', () => {
        process.env.NODE_ENV = 'production';
        expect(isProductionLikeEnvironment()).toBe(true);
      });

      it('should return true when NODE_ENV=PRODUCTION (uppercase)', () => {
        process.env.NODE_ENV = 'PRODUCTION';
        expect(isProductionLikeEnvironment()).toBe(true);
      });

      it('should return true when NODE_ENV=Production (mixed case)', () => {
        process.env.NODE_ENV = 'Production';
        expect(isProductionLikeEnvironment()).toBe(true);
      });
    });

    describe('development-like environments', () => {
      it('should return false when NODE_ENV=development', () => {
        process.env.NODE_ENV = 'development';
        expect(isProductionLikeEnvironment()).toBe(false);
      });

      it('should return false when NODE_ENV=DEVELOPMENT (uppercase)', () => {
        process.env.NODE_ENV = 'DEVELOPMENT';
        expect(isProductionLikeEnvironment()).toBe(false);
      });

      it('should return false when NODE_ENV=test', () => {
        process.env.NODE_ENV = 'test';
        expect(isProductionLikeEnvironment()).toBe(false);
      });

      it('should return false when NODE_ENV=TEST (uppercase)', () => {
        process.env.NODE_ENV = 'TEST';
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

      it('should return false when NODE_ENV is unknown value', () => {
        process.env.NODE_ENV = 'local';
        expect(isProductionLikeEnvironment()).toBe(false);
      });

      it('should return false when NODE_ENV is invalid value', () => {
        process.env.NODE_ENV = 'prod';
        expect(isProductionLikeEnvironment()).toBe(false);
      });

      it('should return false when NODE_ENV contains whitespace', () => {
        process.env.NODE_ENV = ' staging ';
        expect(isProductionLikeEnvironment()).toBe(false);
      });
    });
  });
});
