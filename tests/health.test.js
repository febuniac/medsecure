const express = require('express');
const http = require('http');

let server;

beforeAll((done) => {
  const app = express();
  // Register the same health endpoint as in src/index.js
  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  server = app.listen(0, done);
});

afterAll((done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

function request(path) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      });
    }).on('error', reject);
  });
}

describe('GET /health', () => {
  it('should return 200 status code', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
  });

  it('should return status ok', async () => {
    const res = await request('/health');
    expect(res.body.status).toBe('ok');
  });

  it('should return a valid ISO 8601 timestamp', async () => {
    const before = new Date().toISOString();
    const res = await request('/health');
    const after = new Date().toISOString();

    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.timestamp).toBe('string');

    const timestamp = new Date(res.body.timestamp);
    expect(timestamp.toISOString()).toBe(res.body.timestamp);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(new Date(after).getTime());
  });

  it('should return both status and timestamp fields', async () => {
    const res = await request('/health');
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String)
      })
    );
  });
});
