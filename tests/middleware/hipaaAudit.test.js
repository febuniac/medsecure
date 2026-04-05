const EventEmitter = require('events');

// Mock the logger before requiring the middleware
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const hipaaAudit = require('../../src/middleware/hipaaAudit');
const { logger } = require('../../src/utils/logger');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hipaaAudit middleware', () => {
  const createMockReqRes = (overrides = {}) => {
    const req = {
      method: 'GET',
      path: '/api/v1/patients',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      user: { id: 'user-123' },
      ...overrides,
    };

    // Use a simple EventEmitter as the response mock
    const res = new EventEmitter();
    res.statusCode = 200;

    return { req, res };
  };

  it('should call next immediately', () => {
    const { req, res } = createMockReqRes();
    const next = jest.fn();

    hipaaAudit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should log audit entry with HIPAA_AUDIT type on response finish', () => {
    const { req, res } = createMockReqRes();

    hipaaAudit(req, res, () => {});
    res.emit('finish');

    expect(logger.info).toHaveBeenCalledTimes(1);
    const loggedEntry = logger.info.mock.calls[0][0];
    expect(loggedEntry.type).toBe('HIPAA_AUDIT');
    expect(loggedEntry.method).toBe('GET');
    expect(loggedEntry.path).toBe('/api/v1/patients');
    expect(loggedEntry.userId).toBe('user-123');
    expect(loggedEntry.ip).toBe('127.0.0.1');
    expect(loggedEntry.eventId).toBeDefined();
    expect(loggedEntry.timestamp).toBeDefined();
    expect(typeof loggedEntry.duration).toBe('number');
  });

  it('should include eventId (UUID) and timestamp in audit entries', () => {
    const { req, res } = createMockReqRes();

    hipaaAudit(req, res, () => {});
    res.emit('finish');

    const loggedEntry = logger.info.mock.calls[0][0];
    // UUID v4 pattern
    expect(loggedEntry.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(new Date(loggedEntry.timestamp).toISOString()).toBe(loggedEntry.timestamp);
  });

  it('should handle missing user gracefully', () => {
    const { req, res } = createMockReqRes({ user: undefined });

    hipaaAudit(req, res, () => {});
    res.emit('finish');

    const loggedEntry = logger.info.mock.calls[0][0];
    expect(loggedEntry.type).toBe('HIPAA_AUDIT');
    expect(loggedEntry.userId).toBeUndefined();
  });
});
