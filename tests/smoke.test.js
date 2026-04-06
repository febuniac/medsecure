/**
 * Smoke tests — verify core modules load and basic functionality works
 * without requiring database, Redis, or other external services.
 */

describe('Smoke Tests', () => {
  describe('Module Loading', () => {
    test('loads passwordValidator module', () => {
      const mod = require('../src/utils/passwordValidator');
      expect(mod).toBeDefined();
      expect(typeof mod.validatePassword).toBe('function');
    });

    test('loads encryption module', () => {
      const mod = require('../src/utils/encryption');
      expect(mod).toBeDefined();
      expect(typeof mod.encrypt).toBe('function');
      expect(typeof mod.decrypt).toBe('function');
    });

    test('loads logger module', () => {
      const mod = require('../src/utils/logger');
      expect(mod).toBeDefined();
      expect(mod.logger).toBeDefined();
    });

    test('loads hipaaAudit middleware', () => {
      const mod = require('../src/middleware/hipaaAudit');
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('function');
      expect(typeof mod.getFailureReason).toBe('function');
    });

    test('loads httpsEnforcement middleware', () => {
      const mod = require('../src/middleware/httpsEnforcement');
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('function');
      expect(typeof mod.isPhiEndpoint).toBe('function');
      expect(typeof mod.isSecure).toBe('function');
    });

    test('loads breachDetection middleware', () => {
      const mod = require('../src/middleware/breachDetection');
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('function');
    });

    test('loads auth middleware', () => {
      const mod = require('../src/middleware/auth');
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('function');
    });
  });

  describe('Password Validator', () => {
    const { validatePassword, PASSWORD_MIN_LENGTH } = require('../src/utils/passwordValidator');

    test('exports PASSWORD_MIN_LENGTH constant', () => {
      expect(PASSWORD_MIN_LENGTH).toBe(8);
    });

    test('rejects empty input', () => {
      expect(validatePassword('')).toContain('Password is required');
    });

    test('accepts a valid password', () => {
      expect(validatePassword('SecureP1ss')).toHaveLength(0);
    });
  });

  describe('HTTPS Enforcement helpers', () => {
    const { isPhiEndpoint, isSecure, PHI_ROUTE_PATTERNS } = require('../src/middleware/httpsEnforcement');

    test('PHI_ROUTE_PATTERNS is a non-empty array', () => {
      expect(Array.isArray(PHI_ROUTE_PATTERNS)).toBe(true);
      expect(PHI_ROUTE_PATTERNS.length).toBeGreaterThan(0);
    });

    test('isPhiEndpoint recognises patient routes', () => {
      expect(isPhiEndpoint('/api/v1/patients')).toBe(true);
      expect(isPhiEndpoint('/api/v1/patients/123')).toBe(true);
    });

    test('isPhiEndpoint rejects non-PHI routes', () => {
      expect(isPhiEndpoint('/health')).toBe(false);
    });

    test('isSecure detects secure requests', () => {
      expect(isSecure({ secure: true, headers: {}, protocol: 'http' })).toBe(true);
      expect(isSecure({ secure: false, headers: { 'x-forwarded-proto': 'https' }, protocol: 'http' })).toBe(true);
      expect(isSecure({ secure: false, headers: {}, protocol: 'https' })).toBe(true);
    });

    test('isSecure detects insecure requests', () => {
      expect(isSecure({ secure: false, headers: {}, protocol: 'http' })).toBe(false);
    });
  });

  describe('HIPAA Audit helpers', () => {
    const { getFailureReason } = require('../src/middleware/hipaaAudit');

    test('returns authentication_failed for 401', () => {
      expect(getFailureReason(401)).toBe('authentication_failed');
    });

    test('returns authorization_denied for 403', () => {
      expect(getFailureReason(403)).toBe('authorization_denied');
    });

    test('returns undefined for other codes', () => {
      expect(getFailureReason(200)).toBeUndefined();
      expect(getFailureReason(500)).toBeUndefined();
    });
  });
});
