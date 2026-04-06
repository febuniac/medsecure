const requireAdmin = require('../src/middleware/requireAdmin');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

beforeEach(() => {
  jest.clearAllMocks();
});

function createMockRes() {
  const res = {
    statusCode: 200,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

describe('requireAdmin Middleware', () => {
  describe('access denied for non-admin users', () => {
    it('should return 403 for user with viewer role', () => {
      const req = { user: { id: 'user-1', role: 'viewer' }, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for user with provider role', () => {
      const req = { user: { id: 'user-2', role: 'provider' }, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for user with nurse role', () => {
      const req = { user: { id: 'user-3', role: 'nurse' }, path: '/settings', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user object has no role', () => {
      const req = { user: { id: 'user-4' }, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when req.user is undefined', () => {
      const req = { user: undefined, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when req.user is null', () => {
      const req = { user: null, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('access granted for admin users', () => {
    it('should call next() for user with admin role', () => {
      const req = { user: { id: 'admin-1', role: 'admin' }, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should not log a warning for admin users', () => {
      const req = { user: { id: 'admin-1', role: 'admin' }, path: '/users', method: 'GET', ip: '10.0.0.1' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('audit logging for denied access', () => {
    it('should log a warning with user details when access is denied', () => {
      const req = { user: { id: 'user-1', role: 'viewer' }, path: '/users', method: 'GET', ip: '192.168.1.50' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AUTHORIZATION',
          action: 'admin_access_denied',
          userId: 'user-1',
          path: '/users',
          method: 'GET',
          ip: '192.168.1.50'
        })
      );
    });

    it('should log anonymous userId when user is missing', () => {
      const req = { user: undefined, path: '/settings', method: 'POST', ip: '10.0.0.5' };
      const res = createMockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'anonymous'
        })
      );
    });
  });
});
