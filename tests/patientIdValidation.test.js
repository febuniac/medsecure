const express = require('express');

// Mock dependencies before requiring the router
jest.mock('../src/services/patientService', () => ({
  getById: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../src/utils/errorCodes', () => ({
  formatErrorResponse: jest.fn((err) => ({
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: err.message } },
  })),
}));

const request = require('supertest');

function createApp() {
  const app = express();
  app.use(express.json());
  // Add a mock user middleware
  app.use((req, _res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  });
  const patientRouter = require('../src/api/patients');
  app.use('/patients', patientRouter);
  return app;
}

describe('Patient ID Validation', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /patients/:id', () => {
    test('rejects non-numeric patient ID with 400', async () => {
      const res = await request(app).get('/patients/abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('rejects patient ID with special characters', async () => {
      const res = await request(app).get('/patients/1;DROP%20TABLE');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('rejects patient ID with mixed alphanumeric', async () => {
      const res = await request(app).get('/patients/12abc34');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('rejects patient ID with decimal point', async () => {
      const res = await request(app).get('/patients/1.5');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('rejects patient ID with negative sign', async () => {
      const res = await request(app).get('/patients/-1');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('accepts valid numeric patient ID', async () => {
      const PatientService = require('../src/services/patientService');
      PatientService.getById.mockResolvedValue({ id: 123, first_name: 'John' });

      const res = await request(app).get('/patients/123');
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /patients/:id', () => {
    test('rejects non-numeric patient ID with 400', async () => {
      const res = await request(app).put('/patients/abc').send({ first_name: 'Jane' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('rejects patient ID with special characters', async () => {
      const res = await request(app).put('/patients/<script>').send({ first_name: 'Jane' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('rejects patient ID with spaces', async () => {
      const res = await request(app).put('/patients/1%202').send({ first_name: 'Jane' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid patient ID');
    });

    test('accepts valid numeric patient ID', async () => {
      const PatientService = require('../src/services/patientService');
      PatientService.update.mockResolvedValue({ id: 456, first_name: 'Jane' });

      const res = await request(app).put('/patients/456').send({ first_name: 'Jane' });
      expect(res.status).toBe(200);
    });
  });
});
