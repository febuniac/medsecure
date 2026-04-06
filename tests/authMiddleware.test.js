const jwt = require('jsonwebtoken');
const authenticate = require('../src/middleware/auth');
const { generateToken, SESSION_EXPIRY } = require('../src/middleware/auth');

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

describe('Auth Middleware - generateToken', () => {
  it('should include id, email, and role in the token payload', () => {
    const user = { id: 1, email: 'doctor@medsecure.com', role: 'admin' };
    const token = generateToken(user);
    const decoded = jwt.verify(token, TEST_SECRET);

    expect(decoded.id).toBe(user.id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.role).toBe(user.role);
  });

  it('should include role claim for viewer role', () => {
    const user = { id: 2, email: 'viewer@medsecure.com', role: 'viewer' };
    const token = generateToken(user);
    const decoded = jwt.verify(token, TEST_SECRET);

    expect(decoded.role).toBe('viewer');
  });

  it('should include role claim for provider role', () => {
    const user = { id: 3, email: 'provider@medsecure.com', role: 'provider' };
    const token = generateToken(user);
    const decoded = jwt.verify(token, TEST_SECRET);

    expect(decoded.role).toBe('provider');
  });

  it('should set role to undefined when user has no role', () => {
    const user = { id: 4, email: 'norole@medsecure.com' };
    const token = generateToken(user);
    const decoded = jwt.verify(token, TEST_SECRET);

    expect(decoded.id).toBe(4);
    expect(decoded.email).toBe('norole@medsecure.com');
    expect(decoded.role).toBeUndefined();
  });

  it('should produce a valid JWT string', () => {
    const user = { id: 1, email: 'test@medsecure.com', role: 'admin' };
    const token = generateToken(user);

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('should not include password or other sensitive fields in token', () => {
    const user = { id: 1, email: 'test@medsecure.com', role: 'admin', password: 'hashed_pw', name: 'Dr. Test' };
    const token = generateToken(user);
    const decoded = jwt.verify(token, TEST_SECRET);

    expect(decoded.password).toBeUndefined();
    expect(decoded.name).toBeUndefined();
  });
});

describe('Auth Middleware - authenticate', () => {
  it('should set req.user with role from a valid token', () => {
    const user = { id: 1, email: 'admin@medsecure.com', role: 'admin' };
    const token = generateToken(user);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(1);
    expect(req.user.email).toBe('admin@medsecure.com');
    expect(req.user.role).toBe('admin');
  });

  it('should preserve role through token generation and verification round-trip', () => {
    const roles = ['admin', 'provider', 'viewer', 'nurse'];

    roles.forEach(role => {
      const user = { id: 10, email: `${role}@medsecure.com`, role };
      const token = generateToken(user);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe(role);
    });
  });

  it('should return 401 when no token is provided', () => {
    const req = { headers: {} };
    const res = createMockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalid.token.here' } };
    const res = createMockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for a token signed with a different secret', () => {
    const token = jwt.sign({ id: 1, email: 'test@medsecure.com', role: 'admin' }, 'wrong-secret');

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
