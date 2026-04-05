const breachDetectionMiddleware = require('../src/middleware/breachDetection');
const {
  resetTrackers,
  getTrackerState,
  trackBulkAccess,
  trackFailedAuth,
  isSensitiveEndpoint,
  CONFIG
} = require('../src/middleware/breachDetection');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

beforeEach(() => {
  jest.clearAllMocks();
  resetTrackers();
});

describe('Breach Detection Middleware', () => {
  describe('isSensitiveEndpoint', () => {
    test('identifies patient endpoint as sensitive', () => {
      expect(isSensitiveEndpoint('/api/v1/patients')).toBe(true);
      expect(isSensitiveEndpoint('/api/v1/patients/123')).toBe(true);
    });

    test('identifies records endpoint as sensitive', () => {
      expect(isSensitiveEndpoint('/api/v1/records')).toBe(true);
    });

    test('identifies prescriptions endpoint as sensitive', () => {
      expect(isSensitiveEndpoint('/api/v1/prescriptions')).toBe(true);
    });

    test('does not flag non-sensitive endpoints', () => {
      expect(isSensitiveEndpoint('/api/v1/appointments')).toBe(false);
      expect(isSensitiveEndpoint('/health')).toBe(false);
      expect(isSensitiveEndpoint('/api/v1/breach-notifications')).toBe(false);
    });
  });

  describe('trackBulkAccess', () => {
    test('returns false below threshold', () => {
      for (let i = 0; i < CONFIG.bulkAccessThreshold - 1; i++) {
        expect(trackBulkAccess('user-1', '/api/v1/patients')).toBe(false);
      }
    });

    test('returns true when threshold reached', () => {
      for (let i = 0; i < CONFIG.bulkAccessThreshold - 1; i++) {
        trackBulkAccess('user-1', '/api/v1/patients');
      }
      expect(trackBulkAccess('user-1', '/api/v1/patients')).toBe(true);
    });

    test('tracks separate users independently', () => {
      for (let i = 0; i < CONFIG.bulkAccessThreshold - 1; i++) {
        trackBulkAccess('user-1', '/api/v1/patients');
      }
      // user-2 should still be below threshold
      expect(trackBulkAccess('user-2', '/api/v1/patients')).toBe(false);
    });

    test('tracks separate paths independently', () => {
      for (let i = 0; i < CONFIG.bulkAccessThreshold - 1; i++) {
        trackBulkAccess('user-1', '/api/v1/patients');
      }
      // Different path should be below threshold
      expect(trackBulkAccess('user-1', '/api/v1/records')).toBe(false);
    });
  });

  describe('trackFailedAuth', () => {
    test('returns false below threshold', () => {
      for (let i = 0; i < CONFIG.failedAuthThreshold - 1; i++) {
        expect(trackFailedAuth('192.168.1.1')).toBe(false);
      }
    });

    test('returns true when threshold reached', () => {
      for (let i = 0; i < CONFIG.failedAuthThreshold - 1; i++) {
        trackFailedAuth('192.168.1.1');
      }
      expect(trackFailedAuth('192.168.1.1')).toBe(true);
    });

    test('tracks different IPs independently', () => {
      for (let i = 0; i < CONFIG.failedAuthThreshold - 1; i++) {
        trackFailedAuth('192.168.1.1');
      }
      expect(trackFailedAuth('192.168.1.2')).toBe(false);
    });
  });

  describe('resetTrackers', () => {
    test('clears all tracking data', () => {
      trackBulkAccess('user-1', '/api/v1/patients');
      trackFailedAuth('192.168.1.1');

      const stateBefore = getTrackerState();
      expect(stateBefore.accessTrackerSize).toBeGreaterThan(0);
      expect(stateBefore.failedAuthTrackerSize).toBeGreaterThan(0);

      resetTrackers();

      const stateAfter = getTrackerState();
      expect(stateAfter.accessTrackerSize).toBe(0);
      expect(stateAfter.failedAuthTrackerSize).toBe(0);
    });
  });

  describe('middleware function', () => {
    function createMockReqRes(overrides = {}) {
      const finishHandlers = [];
      const req = {
        user: { id: 'user-1' },
        ip: '127.0.0.1',
        path: '/api/v1/patients',
        method: 'GET',
        headers: { 'user-agent': 'test' },
        ...overrides
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, handler) => {
          if (event === 'finish') finishHandlers.push(handler);
        }),
        ...overrides.res
      };
      return { req, res, finishHandlers };
    }

    test('calls next() to pass through', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      breachDetectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('registers a finish event handler', () => {
      const { req, res } = createMockReqRes();
      const next = jest.fn();

      breachDetectionMiddleware(req, res, next);
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    test('logs BREACH_TRIGGER for unauthorized PHI access (403)', () => {
      const { req, res, finishHandlers } = createMockReqRes({
        path: '/api/v1/patients',
        res: { statusCode: 403 }
      });
      const next = jest.fn();

      breachDetectionMiddleware(req, res, next);
      // Simulate response finish
      finishHandlers.forEach(fn => fn());

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BREACH_TRIGGER',
          trigger_type: 'unauthorized_phi_access',
          risk_level: 'critical'
        })
      );
    });

    test('logs BREACH_TRIGGER when failed auth threshold is exceeded', () => {
      const next = jest.fn();

      // Hit the threshold
      for (let i = 0; i < CONFIG.failedAuthThreshold; i++) {
        const { req, res, finishHandlers } = createMockReqRes({
          path: '/api/v1/patients',
          res: { statusCode: 401 }
        });
        breachDetectionMiddleware(req, res, next);
        finishHandlers.forEach(fn => fn());
      }

      // Should have logged at least one repeated_auth_failure trigger
      const triggerCalls = logger.warn.mock.calls.filter(
        call => call[0]?.trigger_type === 'repeated_auth_failure'
      );
      expect(triggerCalls.length).toBeGreaterThan(0);
    });
  });

  describe('CONFIG', () => {
    test('has reasonable default thresholds', () => {
      expect(CONFIG.bulkAccessThreshold).toBe(100);
      expect(CONFIG.bulkAccessWindowMs).toBe(300000); // 5 minutes
      expect(CONFIG.failedAuthThreshold).toBe(10);
      expect(CONFIG.failedAuthWindowMs).toBe(600000); // 10 minutes
    });

    test('monitors PHI-sensitive endpoints', () => {
      expect(CONFIG.sensitiveEndpoints).toContain('/api/v1/patients');
      expect(CONFIG.sensitiveEndpoints).toContain('/api/v1/records');
      expect(CONFIG.sensitiveEndpoints).toContain('/api/v1/prescriptions');
    });

    test('defines after-hours window', () => {
      expect(CONFIG.afterHoursStart).toBe(22);
      expect(CONFIG.afterHoursEnd).toBe(6);
    });
  });
});
