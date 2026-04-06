const requireAdmin = require('../src/middleware/requireAdmin');

describe('requireAdmin middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() when user has admin role', () => {
    req.user = { id: 1, email: 'admin@example.com', role: 'admin' };
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 when user has viewer role', () => {
    req.user = { id: 2, email: 'viewer@example.com', role: 'viewer' };
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'ADMIN_ONLY',
          message: 'Forbidden',
        }),
      })
    );
  });

  it('should return 403 when user has provider role', () => {
    req.user = { id: 3, email: 'doc@example.com', role: 'provider' };
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when user has nurse role', () => {
    req.user = { id: 4, email: 'nurse@example.com', role: 'nurse' };
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when user role is undefined', () => {
    req.user = { id: 5, email: 'norole@example.com' };
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when req.user is undefined', () => {
    req.user = undefined;
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when user role is empty string', () => {
    req.user = { id: 6, email: 'empty@example.com', role: '' };
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when user role is null', () => {
    req.user = { id: 7, email: 'null@example.com', role: null };
    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('Admin route wiring', () => {
  it('should mount admin routes with requireAdmin middleware in v1Router', () => {
    // Verify the v1Router file imports and uses requireAdmin
    const fs = require('fs');
    const path = require('path');
    const routerSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'api', 'v1Router.js'),
      'utf8'
    );
    expect(routerSource).toContain("require('../middleware/requireAdmin')");
    expect(routerSource).toContain("'/admin'");
    expect(routerSource).toContain('requireAdmin');
  });

  it('should export requireAdmin as a function', () => {
    expect(typeof requireAdmin).toBe('function');
    expect(requireAdmin.length).toBe(3); // (req, res, next)
  });
});
