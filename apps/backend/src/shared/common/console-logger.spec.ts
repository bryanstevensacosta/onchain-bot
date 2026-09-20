import { Logger } from '@nestjs/common';
import { ConsoleLogger } from './console-logger';

describe('ConsoleLogger level routing', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes error() at error level, never debug', () => {
    const sut = new ConsoleLogger(`t20-error-${Date.now()}.log`);
    sut.error('boom');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    sut.clear();
  });

  it('routes warn() at warn level, never debug', () => {
    const sut = new ConsoleLogger(`t20-warn-${Date.now()}.log`);
    sut.warn('careful');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    sut.clear();
  });

  it('routes log() at log level', () => {
    const sut = new ConsoleLogger(`t20-log-${Date.now()}.log`);
    sut.log('hello');
    expect(logSpy).toHaveBeenCalledTimes(1);
    sut.clear();
  });

  it('routes debug() at debug level', () => {
    const sut = new ConsoleLogger(`t20-debug-${Date.now()}.log`);
    sut.debug('trace');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    sut.clear();
  });
});
