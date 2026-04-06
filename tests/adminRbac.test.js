const requireAdmin = require('../src/middleware/requireAdmin');
const { ErrorCodes } = require('../src/utils/errorCodes');

describe('Admin Role-Based Access Control', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('requireAdmin middleware', () => {
    it('should call next() when user has admin role', () => {
      req.user = { id: 'user-1', email: 'admin@example.com', role: 'admin' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 403 when user has viewer role', () => {
      req.user = { id: 'user-2', email: 'viewer@example.com', role: 'viewer' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCodes.ADMIN_ONLY,
            message: 'Forbidden',
          }),
        })
      );
    });

    it('should return 403 when user has provider role', () => {
      req.user = { id: 'user-3', email: 'provider@example.com', role: 'provider' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when user has nurse role', () => {
      req.user = { id: 'user-4', email: 'nurse@example.com', role: 'nurse' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when user object has no role property', () => {
      req.user = { id: 'user-5', email: 'norole@example.com' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when user is null', () => {
      req.user = null;

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when user is undefined', () => {
      req.user = undefined;

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when role is empty string', () => {
      req.user = { id: 'user-6', email: 'empty@example.com', role: '' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 for case-sensitive role mismatch (Admin vs admin)', () => {
      req.user = { id: 'user-7', email: 'case@example.com', role: 'Admin' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireAdmin module exports', () => {
    it('should export a function', () => {
      expect(typeof requireAdmin).toBe('function');
    });

    it('should accept three arguments (req, res, next)', () => {
      expect(requireAdmin.length).toBe(3);
    });
  });

  describe('requireAdmin middleware error response format', () => {
    it('should return structured error with ADMIN_ONLY code', () => {
      req.user = { id: 'user-10', role: 'viewer' };

      requireAdmin(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'ADMIN_ONLY',
          message: 'Forbidden',
        },
      });
    });

    it('should not modify the request object', () => {
      const originalUser = { id: 'user-11', role: 'admin' };
      req.user = originalUser;

      requireAdmin(req, res, next);

      expect(req.user).toBe(originalUser);
    });
  });
});
