import { buildAppConfig } from './app.config';

describe('buildAppConfig', () => {
  it('defaults to dev port :4000', () => {
    expect(buildAppConfig({} as NodeJS.ProcessEnv).port).toBe(4000);
  });

  it('honours MARKET_DATA_PORT', () => {
    expect(
      buildAppConfig({ MARKET_DATA_PORT: '4001' } as NodeJS.ProcessEnv).port,
    ).toBe(4001);
  });
});
