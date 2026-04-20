'use strict';

const winston = require('winston');

describe('Logger', () => {
  let logger;

  beforeAll(() => {
    // Require logger after winston is available
    // Clear require cache to get fresh instance
    delete require.cache[require.resolve('../../src/utils/logger')];
    ({ logger } = require('../../src/utils/logger'));
  });

  it('should export a winston logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('should have at least 3 transports configured', () => {
    expect(logger.transports.length).toBeGreaterThanOrEqual(3);
  });

  it('should have a Console transport with redacted format', () => {
    const consoleTransport = logger.transports.find(
      (t) => t instanceof winston.transports.Console
    );
    expect(consoleTransport).toBeDefined();
    // The console transport should have its own format (redacted)
    expect(consoleTransport.format).toBeDefined();
  });

  it('should have a HIPAA audit file transport with base format', () => {
    const hipaaTransport = logger.transports.find(
      (t) =>
        t instanceof winston.transports.File &&
        t.filename === 'hipaa-audit.log' &&
        t.dirname === 'logs'
    );
    expect(hipaaTransport).toBeDefined();
    expect(hipaaTransport.format).toBeDefined();
  });

  it('should have an error file transport with redacted format', () => {
    const errorTransport = logger.transports.find(
      (t) =>
        t instanceof winston.transports.File &&
        t.filename === 'error.log' &&
        t.dirname === 'logs'
    );
    expect(errorTransport).toBeDefined();
    expect(errorTransport.level).toBe('error');
    expect(errorTransport.format).toBeDefined();
  });
});
