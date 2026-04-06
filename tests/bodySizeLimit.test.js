const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

describe('Request Body Size Limit', () => {
  describe('Source code verification', () => {
    test('express.json is configured with a 5mb limit in index.js', () => {
      const indexSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'index.js'),
        'utf8'
      );
      expect(indexSource).toContain("express.json({ limit: '5mb' })");
    });

    test('express.json is NOT configured with an excessive limit', () => {
      const indexSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'index.js'),
        'utf8'
      );
      expect(indexSource).not.toContain("express.json({ limit: '50mb' })");
      expect(indexSource).not.toContain("express.json({ limit: '100mb' })");
      expect(indexSource).not.toMatch(/express\.json\(\s*\)/);
    });
  });

  describe('Integration tests with Express body parser limit', () => {
    let app;
    let server;

    beforeAll((done) => {
      app = express();
      app.use(express.json({ limit: '5mb' }));
      app.post('/test', (req, res) => {
        res.json({ received: true, size: JSON.stringify(req.body).length });
      });
      server = app.listen(0, done);
    });

    afterAll((done) => {
      server.close(done);
    });

    function makeRequest(body) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
          hostname: 'localhost',
          port: server.address().port,
          path: '/test',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        };

        const req = http.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            resolve({ status: res.statusCode, data: responseData });
          });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });
    }

    test('accepts a normal-sized JSON request body', async () => {
      const smallBody = { data: 'a'.repeat(1000) };
      const response = await makeRequest(smallBody);
      expect(response.status).toBe(200);
    });

    test('accepts a request body just under 5mb', async () => {
      const body = { data: 'y'.repeat(4 * 1024 * 1024) };
      const response = await makeRequest(body);
      expect(response.status).toBe(200);
    });

    test('rejects a request body exceeding 5mb', async () => {
      const largeBody = { data: 'x'.repeat(6 * 1024 * 1024) };
      const response = await makeRequest(largeBody);
      expect(response.status).toBe(413);
    });
  });
});
