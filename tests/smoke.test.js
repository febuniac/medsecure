const { validatePassword, PASSWORD_MIN_LENGTH } = require('../src/utils/passwordValidator');

describe('Smoke Tests', () => {
  describe('Core utilities', () => {
    test('passwordValidator module exports expected functions', () => {
      expect(typeof validatePassword).toBe('function');
      expect(typeof PASSWORD_MIN_LENGTH).toBe('number');
      expect(PASSWORD_MIN_LENGTH).toBeGreaterThan(0);
    });

    test('passwordValidator correctly validates a strong password', () => {
      const errors = validatePassword('SecureP@ss1');
      expect(errors).toEqual([]);
    });

    test('passwordValidator rejects a weak password', () => {
      const errors = validatePassword('weak');
      expect(errors.length).toBeGreaterThan(0);
    });

    test('encryption module exports encrypt and decrypt', () => {
      const encryption = require('../src/utils/encryption');
      expect(typeof encryption.encrypt).toBe('function');
      expect(typeof encryption.decrypt).toBe('function');
    });

    test('logger module exports a logger instance', () => {
      const { logger } = require('../src/utils/logger');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('Middleware modules', () => {
    test('hipaaAudit middleware is a function', () => {
      const hipaaAudit = require('../src/middleware/hipaaAudit');
      expect(typeof hipaaAudit).toBe('function');
    });

    test('breachDetection middleware is a function', () => {
      const breachDetection = require('../src/middleware/breachDetection');
      expect(typeof breachDetection).toBe('function');
    });

    test('httpsEnforcement middleware is a function', () => {
      const httpsEnforcement = require('../src/middleware/httpsEnforcement');
      expect(typeof httpsEnforcement).toBe('function');
    });

    test('auth middleware is a function', () => {
      const auth = require('../src/middleware/auth');
      expect(typeof auth).toBe('function');
    });
  });

  describe('Jest configuration', () => {
    test('jest.config.js exists and is valid', () => {
      const config = require('../jest.config');
      expect(config).toBeDefined();
      expect(config.testEnvironment).toBe('node');
      expect(config.roots).toContain('<rootDir>/tests');
      expect(config.testMatch).toContain('**/*.test.js');
    });

    test('coverage configuration is defined', () => {
      const config = require('../jest.config');
      expect(config.collectCoverageFrom).toBeDefined();
      expect(Array.isArray(config.collectCoverageFrom)).toBe(true);
      expect(config.coverageDirectory).toBe('coverage');
    });
  });
});
