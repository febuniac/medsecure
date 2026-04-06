const securityHeaders = require('../src/middleware/securityHeaders');
const {
  configureHelmet,
  additionalSecurityHeaders,
  HSTS_MAX_AGE
} = require('../src/middleware/securityHeaders');

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
    method: 'GET',
    headers: {
      host: 'medsecure.example.com',
      'user-agent': 'test-agent'
    },
    ...overrides
  };
}

function createMockRes() {
  const headers = {};
  const res = {
    setHeader: jest.fn((name, value) => { headers[name] = value; }),
    getHeader: jest.fn((name) => headers[name]),
    _headers: headers,
    removeHeader: jest.fn(),
    on: jest.fn()
  };
  return res;
}

describe('Security Headers Middleware', () => {
  describe('HSTS_MAX_AGE', () => {
    test('is set to one year in seconds', () => {
      expect(HSTS_MAX_AGE).toBe(365 * 24 * 60 * 60);
    });
  });

  describe('configureHelmet', () => {
    test('returns a function (middleware)', () => {
      const helmetMiddleware = configureHelmet();
      expect(typeof helmetMiddleware).toBe('function');
    });
  });

  describe('additionalSecurityHeaders', () => {
    test('sets X-Content-Type-Options to nosniff', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('sets Strict-Transport-Security with correct max-age, includeSubDomains, and preload', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        `max-age=${HSTS_MAX_AGE}; includeSubDomains; preload`
      );
    });

    test('sets Cache-Control to prevent caching of sensitive data', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
    });

    test('sets Pragma to no-cache', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    });

    test('sets X-Frame-Options to DENY', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    test('sets X-XSS-Protection to 0 (modern best practice)', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '0');
    });

    test('sets Permissions-Policy to restrict browser features', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        'geolocation=(), camera=(), microphone=()'
      );
    });

    test('logs a SECURITY_HEADERS event', () => {
      const req = createMockReq({ path: '/api/v1/records', method: 'POST' });
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SECURITY_HEADERS',
          event: 'headers_applied',
          path: '/api/v1/records',
          method: 'POST'
        })
      );
    });

    test('calls next() after setting headers', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      additionalSecurityHeaders(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('securityHeaders combined middleware', () => {
    test('returns a middleware function', () => {
      const middleware = securityHeaders();
      expect(typeof middleware).toBe('function');
    });

    test('sets security headers on responses', (done) => {
      const middleware = securityHeaders();
      const req = createMockReq();
      const res = createMockRes();

      middleware(req, res, () => {
        expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(res.setHeader).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('max-age=')
        );
        expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
        expect(res.setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
        expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
        expect(res.setHeader).toHaveBeenCalledWith(
          'Permissions-Policy',
          'geolocation=(), camera=(), microphone=()'
        );
        done();
      });
    });

    test('applies headers to all routes including health check', (done) => {
      const middleware = securityHeaders();
      const req = createMockReq({ path: '/health', method: 'GET' });
      const res = createMockRes();

      middleware(req, res, () => {
        expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(res.setHeader).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('includeSubDomains')
        );
        done();
      });
    });

    test('applies headers to PHI endpoints', (done) => {
      const middleware = securityHeaders();
      const req = createMockReq({ path: '/api/v1/patients', method: 'GET' });
      const res = createMockRes();

      middleware(req, res, () => {
        expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(res.setHeader).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('preload')
        );
        expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
        done();
      });
    });
  });
});
