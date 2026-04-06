const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

describe('Rate Limiting', () => {
  describe('Source code verification', () => {
    test('express-rate-limit is listed as a dependency in package.json', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
      );
      expect(pkg.dependencies['express-rate-limit']).toBeDefined();
    });

    test('rateLimiter middleware exists and exports a function', () => {
      const rateLimiter = require('../src/middleware/rateLimiter');
      expect(typeof rateLimiter).toBe('function');
    });

    test('rateLimiter is imported and used in index.js', () => {
      const indexSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'index.js'),
        'utf8'
      );
      expect(indexSource).toContain("require('./middleware/rateLimiter')");
      expect(indexSource).toContain('app.use(rateLimiter)');
    });

    test('rateLimiter is configured with 100 requests per 15 minutes', () => {
      const rateLimiterSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'middleware', 'rateLimiter.js'),
        'utf8'
      );
      expect(rateLimiterSource).toContain('15 * 60 * 1000');
      expect(rateLimiterSource).toContain('max: 100');
    });
  });

  describe('Integration tests with rate limiter', () => {
    let app;
    let server;

    beforeAll((done) => {
      const rateLimit = require('express-rate-limit');
      app = express();

      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5, // use low limit for testing
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' }
      });

      app.use(limiter);
      app.get('/test', (req, res) => {
        res.json({ status: 'ok' });
      });

      server = app.listen(0, done);
    });

    afterAll((done) => {
      server.close(done);
    });

    function makeRequest() {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: server.address().port,
          path: '/test',
          method: 'GET'
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: data
            });
          });
        });

        req.on('error', reject);
        req.end();
      });
    }

    test('allows requests under the rate limit', async () => {
      const response = await makeRequest();
      expect(response.status).toBe(200);
      expect(JSON.parse(response.data)).toEqual({ status: 'ok' });
    });

    test('includes rate limit headers in response', async () => {
      const response = await makeRequest();
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });

    test('returns 429 when rate limit is exceeded', async () => {
      // Exhaust the remaining requests
      for (let i = 0; i < 10; i++) {
        await makeRequest();
      }

      const response = await makeRequest();
      expect(response.status).toBe(429);
      const body = JSON.parse(response.data);
      expect(body.error).toContain('Too many requests');
    });
  });
});
