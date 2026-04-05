const crypto = require('crypto');
const http = require('http');

const VALID_KEY = crypto.randomBytes(32).toString('hex');

jest.mock('../src/middleware/hipaaAudit', () => (req, res, next) => next());
jest.mock('../src/middleware/auth', () => (req, res, next) => next());
jest.mock('../src/models/db', () => jest.fn());
jest.mock('../src/api/patients', () => require('express').Router());
jest.mock('../src/api/records', () => require('express').Router());
jest.mock('../src/api/appointments', () => require('express').Router());
jest.mock('../src/api/prescriptions', () => require('express').Router());
jest.mock('../src/api/providers', () => require('express').Router(), { virtual: true });
jest.mock('../src/api/consent', () => require('express').Router());
jest.mock('../src/api/fhir', () => require('express').Router(), { virtual: true });

function loadAppWithKey(key) {
  if (key !== undefined) {
    process.env.ENCRYPTION_KEY = key;
  } else {
    delete process.env.ENCRYPTION_KEY;
  }
  jest.resetModules();
  jest.mock('../src/middleware/hipaaAudit', () => (req, res, next) => next());
  jest.mock('../src/middleware/auth', () => (req, res, next) => next());
  jest.mock('../src/models/db', () => jest.fn());
  jest.mock('../src/api/patients', () => require('express').Router());
  jest.mock('../src/api/records', () => require('express').Router());
  jest.mock('../src/api/appointments', () => require('express').Router());
  jest.mock('../src/api/prescriptions', () => require('express').Router());
  jest.mock('../src/api/providers', () => require('express').Router(), { virtual: true });
  jest.mock('../src/api/consent', () => require('express').Router());
  jest.mock('../src/api/fhir', () => require('express').Router(), { virtual: true });
  return require('../src/index');
}

function makeRequest(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
      });
    }).on('error', reject);
  });
}

describe('/health endpoint', () => {
  const originalEnv = process.env.ENCRYPTION_KEY;
  let server;

  afterEach((done) => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    jest.resetModules();
    if (server && server.close) {
      server.close(done);
    } else {
      done();
    }
  });

  test('returns 200 and status ok when encryption is healthy', (done) => {
    const app = loadAppWithKey(VALID_KEY);
    server = app.listen(0, async () => {
      const port = server.address().port;
      const { statusCode, body } = await makeRequest(port, '/health');
      expect(statusCode).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.checks.encryption.healthy).toBe(true);
      done();
    });
  });

  test('returns 503 and unhealthy status when encryption key is missing', (done) => {
    const app = loadAppWithKey(undefined);
    server = app.listen(0, async () => {
      const port = server.address().port;
      const { statusCode, body } = await makeRequest(port, '/health');
      expect(statusCode).toBe(503);
      expect(body.status).toBe('unhealthy');
      expect(body.checks.encryption.healthy).toBe(false);
      expect(body.checks.encryption.reason).toMatch(/not configured/i);
      done();
    });
  });

  test('returns 503 when encryption key has wrong length', (done) => {
    const app = loadAppWithKey('abcd1234');
    server = app.listen(0, async () => {
      const port = server.address().port;
      const { statusCode, body } = await makeRequest(port, '/health');
      expect(statusCode).toBe(503);
      expect(body.status).toBe('unhealthy');
      expect(body.checks.encryption.healthy).toBe(false);
      expect(body.checks.encryption.reason).toMatch(/256 bits/i);
      done();
    });
  });
});
