const correlationIdMiddleware = require('../src/middleware/correlationId');
const { generateCorrelationId, HEADER_NAME } = require('../src/middleware/correlationId');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

beforeEach(() => {
  jest.clearAllMocks();
});

function createMockReqRes(overrides = {}) {
  const req = {
    method: 'GET',
    path: '/api/v1/patients',
    headers: {},
    ...overrides
  };
  const responseHeaders = {};
  const res = {
    setHeader: jest.fn((key, value) => {
      responseHeaders[key] = value;
    }),
    getHeader: jest.fn((key) => responseHeaders[key]),
    ...overrides.res
  };
  return { req, res, responseHeaders };
}

describe('Correlation ID Middleware', () => {
  describe('generateCorrelationId', () => {
    test('returns a valid UUID string', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    test('generates unique IDs on each call', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('HEADER_NAME', () => {
    test('is x-correlation-id', () => {
      expect(HEADER_NAME).toBe('x-correlation-id');
    });
  });

  describe('middleware behavior', () => {
    test('generates a correlation ID when none is provided', () => {
      const { req, res, responseHeaders } = createMockReqRes();
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(req.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', req.correlationId);
      expect(responseHeaders['x-correlation-id']).toBe(req.correlationId);
    });

    test('reuses the existing X-Correlation-Id header from the request', () => {
      const existingId = 'abc-123-existing-id';
      const { req, res, responseHeaders } = createMockReqRes({
        headers: { 'x-correlation-id': existingId }
      });
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBe(existingId);
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', existingId);
      expect(responseHeaders['x-correlation-id']).toBe(existingId);
    });

    test('calls next() to pass through', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    test('sets the response header with the correlation ID', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
    });

    test('attaches correlationId to the request object', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(typeof req.correlationId).toBe('string');
      expect(req.correlationId.length).toBeGreaterThan(0);
    });
  });

  describe('logging', () => {
    test('logs correlation ID with request method and path', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CORRELATION_ID',
          correlationId: req.correlationId,
          method: 'GET',
          path: '/api/v1/patients'
        })
      );
    });

    test('logs with the existing correlation ID when provided', () => {
      const existingId = 'existing-trace-id-456';
      const { req, res } = createMockReqRes({
        headers: { 'x-correlation-id': existingId },
        method: 'POST',
        path: '/api/v1/records'
      });
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CORRELATION_ID',
          correlationId: existingId,
          method: 'POST',
          path: '/api/v1/records'
        })
      );
    });

    test('logs exactly once per request', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(logger.info).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple requests', () => {
    test('generates different correlation IDs for different requests', () => {
      const next = jest.fn();

      const { req: req1, res: res1 } = createMockReqRes();
      correlationIdMiddleware(req1, res1, next);

      const { req: req2, res: res2 } = createMockReqRes();
      correlationIdMiddleware(req2, res2, next);

      expect(req1.correlationId).not.toBe(req2.correlationId);
    });
  });
});
