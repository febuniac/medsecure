const httpsEnforcement = require('../src/middleware/httpsEnforcement');
const { isPhiEndpoint, isSecure, PHI_ROUTE_PATTERNS } = require('../src/middleware/httpsEnforcement');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

beforeEach(() => {
  jest.clearAllMocks();
});

function createMockReq(overrides = {}) {
  return {
    path: '/api/v1/patients',
    originalUrl: '/api/v1/patients?page=1',
    method: 'GET',
    secure: false,
    protocol: 'http',
    hostname: 'medsecure.example.com',
    ip: '127.0.0.1',
    headers: {
      host: 'medsecure.example.com',
      'user-agent': 'test-agent'
    },
    ...overrides
  };
}

function createMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis()
  };
  return res;
}

describe('HTTPS Enforcement Middleware', () => {
  describe('PHI_ROUTE_PATTERNS', () => {
    test('includes /api/v1/patients', () => {
      expect(PHI_ROUTE_PATTERNS).toContain('/api/v1/patients');
    });

    test('includes /api/v1/records', () => {
      expect(PHI_ROUTE_PATTERNS).toContain('/api/v1/records');
    });
  });

  describe('isPhiEndpoint', () => {
    test('identifies /api/v1/patients as a PHI endpoint', () => {
      expect(isPhiEndpoint('/api/v1/patients')).toBe(true);
    });

    test('identifies /api/v1/patients/123 as a PHI endpoint', () => {
      expect(isPhiEndpoint('/api/v1/patients/123')).toBe(true);
    });

    test('identifies /api/v1/records as a PHI endpoint', () => {
      expect(isPhiEndpoint('/api/v1/records')).toBe(true);
    });

    test('identifies /api/v1/records/patient/456 as a PHI endpoint', () => {
      expect(isPhiEndpoint('/api/v1/records/patient/456')).toBe(true);
    });

    test('does not flag non-PHI endpoints', () => {
      expect(isPhiEndpoint('/api/v1/appointments')).toBe(false);
      expect(isPhiEndpoint('/health')).toBe(false);
      expect(isPhiEndpoint('/api/v1/providers')).toBe(false);
    });
  });

  describe('isSecure', () => {
    test('returns true when req.secure is true', () => {
      const req = createMockReq({ secure: true });
      expect(isSecure(req)).toBe(true);
    });

    test('returns true when x-forwarded-proto is https', () => {
      const req = createMockReq({
        headers: { ...createMockReq().headers, 'x-forwarded-proto': 'https' }
      });
      expect(isSecure(req)).toBe(true);
    });

    test('returns true when protocol is https', () => {
      const req = createMockReq({ protocol: 'https' });
      expect(isSecure(req)).toBe(true);
    });

    test('returns false for plain HTTP', () => {
      const req = createMockReq();
      expect(isSecure(req)).toBe(false);
    });
  });

  describe('middleware behavior', () => {
    test('allows HTTPS requests to PHI endpoints', () => {
      const req = createMockReq({ secure: true });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('allows HTTP requests to non-PHI endpoints', () => {
      const req = createMockReq({ path: '/health', originalUrl: '/health' });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('redirects GET requests to PHI endpoints over HTTP with 301', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        301,
        'https://medsecure.example.com/api/v1/patients?page=1'
      );
    });

    test('redirects HEAD requests to PHI endpoints over HTTP with 301', () => {
      const req = createMockReq({ method: 'HEAD' });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(301, expect.stringContaining('https://'));
    });

    test('returns 403 for POST requests to PHI endpoints over HTTP', () => {
      const req = createMockReq({ method: 'POST' });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'HTTPS required',
          message: expect.stringContaining('HIPAA')
        })
      );
    });

    test('returns 403 for PUT requests to PHI endpoints over HTTP', () => {
      const req = createMockReq({ method: 'PUT' });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('logs a warning when blocking insecure PHI access', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'HIPAA_SECURITY',
          event: 'insecure_phi_access_blocked',
          method: 'GET',
          path: '/api/v1/patients'
        })
      );
    });

    test('does not log for secure PHI requests', () => {
      const req = createMockReq({ secure: true });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('does not log for non-PHI HTTP requests', () => {
      const req = createMockReq({ path: '/api/v1/appointments', originalUrl: '/api/v1/appointments' });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('handles x-forwarded-proto https for PHI endpoints (behind proxy)', () => {
      const req = createMockReq({
        headers: { ...createMockReq().headers, 'x-forwarded-proto': 'https' }
      });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    test('blocks /api/v1/records over HTTP', () => {
      const req = createMockReq({ path: '/api/v1/records', originalUrl: '/api/v1/records' });
      const res = createMockRes();
      const next = jest.fn();

      httpsEnforcement(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        301,
        'https://medsecure.example.com/api/v1/records'
      );
    });
  });
});
