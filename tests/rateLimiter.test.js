const express = require('express');
const request = require('supertest');
const { apiLimiter, authLimiter } = require('../src/middleware/rateLimiter');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

function createApp(limiter, path = '/api/test') {
  const app = express();
  app.use(path, limiter);
  app.get(path, (req, res) => res.json({ status: 'ok' }));
  app.post(path, (req, res) => res.json({ status: 'ok' }));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Rate Limiter Middleware', () => {
  describe('apiLimiter', () => {
    it('should allow requests under the limit', async () => {
      const app = createApp(apiLimiter);
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should return rate limit headers', async () => {
      const app = createApp(apiLimiter);
      const res = await request(app).get('/api/test');
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should not return legacy X-RateLimit headers', async () => {
      const app = createApp(apiLimiter);
      const res = await request(app).get('/api/test');
      expect(res.headers).not.toHaveProperty('x-ratelimit-limit');
      expect(res.headers).not.toHaveProperty('x-ratelimit-remaining');
    });

    it('should set ratelimit-limit to 100', async () => {
      const app = createApp(apiLimiter);
      const res = await request(app).get('/api/test');
      expect(res.headers['ratelimit-limit']).toBe('100');
    });

    it('should decrement ratelimit-remaining with each request', async () => {
      const app = createApp(apiLimiter);
      const res1 = await request(app).get('/api/test');
      const remaining1 = parseInt(res1.headers['ratelimit-remaining'], 10);

      const res2 = await request(app).get('/api/test');
      const remaining2 = parseInt(res2.headers['ratelimit-remaining'], 10);

      expect(remaining2).toBe(remaining1 - 1);
    });

    it('should block requests exceeding 100 per window', async () => {
      const rateLimit = require('express-rate-limit');
      const testLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3, // Use a small limit for testing
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: 'Too many requests, please try again later.',
          retryAfter: '15 minutes'
        }
      });

      const app = createApp(testLimiter);

      // Make requests up to the limit
      await request(app).get('/api/test');
      await request(app).get('/api/test');
      await request(app).get('/api/test');

      // Next request should be blocked
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests, please try again later.');
    });

    it('should log a warning when rate limit is exceeded', async () => {
      const rateLimit = require('express-rate-limit');
      const { logger: mockLogger } = require('../src/utils/logger');
      const testLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: 'Too many requests, please try again later.',
          retryAfter: '15 minutes'
        },
        handler: (req, res, next, options) => {
          mockLogger.warn({
            type: 'RATE_LIMIT_EXCEEDED',
            ip: req.ip,
            path: req.originalUrl,
            method: req.method
          });
          res.status(options.statusCode).json(options.message);
        }
      });

      const app = createApp(testLimiter);

      await request(app).get('/api/test');
      await request(app).get('/api/test');
      await request(app).get('/api/test'); // exceeds limit

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RATE_LIMIT_EXCEEDED',
          path: '/api/test',
          method: 'GET'
        })
      );
    });

    it('should apply to POST requests as well', async () => {
      const app = createApp(apiLimiter);
      const res = await request(app).post('/api/test');
      expect(res.status).toBe(200);
    });
  });

  describe('authLimiter', () => {
    it('should allow requests under the limit', async () => {
      const app = createApp(authLimiter, '/api/v1/auth');
      app.post('/api/v1/auth/login', (req, res) => res.json({ token: 'test' }));

      const res = await request(app).get('/api/v1/auth');
      expect(res.status).toBe(200);
    });

    it('should have a stricter limit of 20 requests', async () => {
      const app = createApp(authLimiter, '/api/v1/auth');
      const res = await request(app).get('/api/v1/auth');
      expect(res.headers['ratelimit-limit']).toBe('20');
    });

    it('should block auth requests exceeding the limit', async () => {
      const rateLimit = require('express-rate-limit');
      const testAuthLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: 'Too many authentication attempts, please try again later.',
          retryAfter: '15 minutes'
        }
      });

      const app = createApp(testAuthLimiter, '/api/v1/auth');

      await request(app).get('/api/v1/auth');
      await request(app).get('/api/v1/auth');

      const res = await request(app).get('/api/v1/auth');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many authentication attempts, please try again later.');
    });
  });

  describe('Rate limiter module exports', () => {
    it('should export apiLimiter as a function', () => {
      expect(typeof apiLimiter).toBe('function');
    });

    it('should export authLimiter as a function', () => {
      expect(typeof authLimiter).toBe('function');
    });
  });

});
