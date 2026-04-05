const express = require('express');
const { apiLimiter } = require('../src/middleware/rateLimiter');

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { logger } = require('../src/utils/logger');

function createTestApp() {
  const app = express();
  app.use(apiLimiter);
  app.get('/api/v1/patients', (req, res) => res.json({ status: 'ok' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  return app;
}

let server;
let baseUrl;

beforeAll((done) => {
  const app = createTestApp();
  server = app.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

afterAll((done) => {
  if (server) server.close(done);
  else done();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Rate Limiter Middleware', () => {
  test('allows requests under the limit', async () => {
    const res = await fetch(`${baseUrl}/api/v1/patients`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('returns rate limit headers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/patients`);
    expect(res.headers.get('ratelimit-limit')).toBeDefined();
    expect(res.headers.get('ratelimit-remaining')).toBeDefined();
  });

  test('blocks requests over the limit with 429 status', async () => {
    // Send 100 requests to exhaust the limit
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(fetch(`${baseUrl}/health`));
    }
    await Promise.all(requests);

    // The next request should be rate limited
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too many requests, please try again later.');
    expect(body.retryAfter).toBe('15 minutes');
  });

  test('logs a warning when rate limit is exceeded', async () => {
    // Send requests to exhaust the limit (some may already be consumed)
    const requests = [];
    for (let i = 0; i < 110; i++) {
      requests.push(fetch(`${baseUrl}/api/v1/patients`));
    }
    await Promise.all(requests);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RATE_LIMIT_EXCEEDED'
      })
    );
  });
});

describe('Rate Limiter Configuration', () => {
  test('exports apiLimiter as a function', () => {
    expect(typeof apiLimiter).toBe('function');
  });
});
