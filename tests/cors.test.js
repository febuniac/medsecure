const corsMiddleware = require('../src/middleware/cors');
const { getAllowedOrigins, DEFAULT_ALLOWED_ORIGINS } = require('../src/middleware/cors');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.CORS_ALLOWED_ORIGINS;
});

afterAll(() => {
  process.env = originalEnv;
});

function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    ...overrides
  };
}

function createMockRes() {
  const res = {
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis()
  };
  return res;
}

describe('CORS Middleware', () => {
  describe('DEFAULT_ALLOWED_ORIGINS', () => {
    test('includes https://portal.medsecure.com', () => {
      expect(DEFAULT_ALLOWED_ORIGINS).toContain('https://portal.medsecure.com');
    });

    test('does not include wildcard *', () => {
      expect(DEFAULT_ALLOWED_ORIGINS).not.toContain('*');
    });
  });

  describe('getAllowedOrigins', () => {
    test('returns default origins when CORS_ALLOWED_ORIGINS is not set', () => {
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://portal.medsecure.com']);
    });

    test('parses CORS_ALLOWED_ORIGINS env var', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    });

    test('trims whitespace from CORS_ALLOWED_ORIGINS entries', () => {
      process.env.CORS_ALLOWED_ORIGINS = ' https://app.example.com , https://admin.example.com ';
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    });

    test('filters out empty strings from CORS_ALLOWED_ORIGINS', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com,,';
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://app.example.com']);
    });
  });

  describe('request handling with allowed origin', () => {
    test('sets Access-Control-Allow-Origin for allowed origin', () => {
      const req = createMockReq({ headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://portal.medsecure.com');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('sets Access-Control-Allow-Credentials for allowed origin', () => {
      const req = createMockReq({ headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
    });

    test('sets allowed methods header', () => {
      const req = createMockReq({ headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    });

    test('sets allowed headers including Authorization', () => {
      const req = createMockReq({ headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    });
  });

  describe('request handling with disallowed origin', () => {
    test('does not set Access-Control-Allow-Origin for disallowed origin', () => {
      const req = createMockReq({ headers: { origin: 'https://evil.example.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      const setHeaderCalls = res.setHeader.mock.calls.map(c => c[0]);
      const allowOriginCalls = res.setHeader.mock.calls.filter(c => c[0] === 'Access-Control-Allow-Origin');
      expect(allowOriginCalls).toHaveLength(0);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('does not set Access-Control-Allow-Origin when no origin header', () => {
      const req = createMockReq({ headers: {} });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      const allowOriginCalls = res.setHeader.mock.calls.filter(c => c[0] === 'Access-Control-Allow-Origin');
      expect(allowOriginCalls).toHaveLength(0);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('never sets Access-Control-Allow-Origin to wildcard *', () => {
      const req = createMockReq({ headers: { origin: 'https://evil.example.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      const allowOriginCalls = res.setHeader.mock.calls.filter(c => c[0] === 'Access-Control-Allow-Origin');
      allowOriginCalls.forEach(call => {
        expect(call[1]).not.toBe('*');
      });
    });
  });

  describe('preflight (OPTIONS) requests', () => {
    test('returns 204 for OPTIONS with allowed origin', () => {
      const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 for OPTIONS with disallowed origin', () => {
      const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Origin not allowed' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 for OPTIONS with no origin header', () => {
      const req = createMockReq({ method: 'OPTIONS', headers: {} });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Origin not allowed' });
      expect(next).not.toHaveBeenCalled();
    });

    test('logs warning for rejected preflight', () => {
      const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CORS_REJECTED',
          origin: 'https://evil.example.com'
        })
      );
    });
  });

  describe('custom CORS_ALLOWED_ORIGINS', () => {
    test('allows origin from custom env var', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://custom.example.com,https://portal.medsecure.com';
      const req = createMockReq({ headers: { origin: 'https://custom.example.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://custom.example.com');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('rejects origin not in custom env var list', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://custom.example.com';
      const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('HIPAA compliance', () => {
    test('patient API does not get wildcard CORS origin', () => {
      const req = createMockReq({
        path: '/api/v1/patients',
        headers: { origin: 'https://untrusted.example.com' }
      });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      const allowOriginCalls = res.setHeader.mock.calls.filter(c => c[0] === 'Access-Control-Allow-Origin');
      allowOriginCalls.forEach(call => {
        expect(call[1]).not.toBe('*');
      });
    });

    test('records API does not get wildcard CORS origin', () => {
      const req = createMockReq({
        path: '/api/v1/records',
        headers: { origin: 'https://untrusted.example.com' }
      });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      const allowOriginCalls = res.setHeader.mock.calls.filter(c => c[0] === 'Access-Control-Allow-Origin');
      allowOriginCalls.forEach(call => {
        expect(call[1]).not.toBe('*');
      });
    });

    test('sets Max-Age header for caching preflight responses', () => {
      const req = createMockReq({ headers: { origin: 'https://portal.medsecure.com' } });
      const res = createMockRes();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
    });
  });
});
