const jwt = require('jsonwebtoken');
const authMiddleware = require('../src/middleware/auth');

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

function createMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

describe('Auth Middleware — JWT role claim', () => {
  describe('tokens with role claim', () => {
    it('should set req.user with role when token includes role', () => {
      const token = jwt.sign({ id: 'user-1', email: 'doc@example.com', role: 'provider' }, TEST_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user-1');
      expect(req.user.email).toBe('doc@example.com');
      expect(req.user.role).toBe('provider');
    });

    it('should accept admin role in token', () => {
      const token = jwt.sign({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, TEST_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.role).toBe('admin');
    });

    it('should accept viewer role in token', () => {
      const token = jwt.sign({ id: 'user-2', email: 'viewer@example.com', role: 'viewer' }, TEST_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.role).toBe('viewer');
    });

    it('should accept nurse role in token', () => {
      const token = jwt.sign({ id: 'user-3', email: 'nurse@example.com', role: 'nurse' }, TEST_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.role).toBe('nurse');
    });
  });

  describe('tokens without role claim', () => {
    it('should reject token that has no role claim', () => {
      const token = jwt.sign({ id: 'user-1', email: 'user@example.com' }, TEST_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_TOKEN',
            message: 'Token missing required role claim'
          })
        })
      );
    });

    it('should reject token with empty string role', () => {
      const token = jwt.sign({ id: 'user-1', email: 'user@example.com', role: '' }, TEST_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('missing or invalid tokens', () => {
    it('should return 401 when no authorization header is present', () => {
      const req = { headers: {} };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'AUTHENTICATION_REQUIRED'
          })
        })
      );
    });

    it('should return 401 for an invalid/malformed token', () => {
      const req = { headers: { authorization: 'Bearer invalid.token.here' } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_TOKEN',
            message: 'Invalid token'
          })
        })
      );
    });

    it('should return 401 for a token signed with wrong secret', () => {
      const token = jwt.sign({ id: 'user-1', role: 'admin' }, 'wrong-secret');
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for an expired token', () => {
      const token = jwt.sign({ id: 'user-1', role: 'admin' }, TEST_SECRET, { expiresIn: '-1s' });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});

describe('Login endpoint — JWT token includes role', () => {
  it('should produce a token payload that includes the role field', () => {
    // Simulate what src/api/auth.js login does
    const user = { id: 42, email: 'doctor@hospital.com', role: 'provider' };
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded.id).toBe(42);
    expect(decoded.email).toBe('doctor@hospital.com');
    expect(decoded.role).toBe('provider');
  });

  it('should produce a token that passes the auth middleware', () => {
    const user = { id: 7, email: 'admin@hospital.com', role: 'admin' };
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(7);
    expect(req.user.role).toBe('admin');
  });
});
